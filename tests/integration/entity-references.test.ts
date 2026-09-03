import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as entityRecordService from "@/lib/entities/entity-record-service";
import { InvalidReferenceError } from "@/lib/entities/references";

// A `reference` field stores another record's id. The schema layer can't
// validate that — it has no database access and no organisation context —
// so these tests cover the checks that have to live above it, and in
// particular the one that would otherwise be a tenancy hole.
describe("record references", () => {
  const organisationId = "test-org-references";
  const otherOrganisationId = "test-org-references-other";
  let customerTypeId: string;
  let orderTypeId: string;
  let customerRecordId: string;
  let otherCustomerRecordId: string;

  beforeAll(async () => {
    for (const id of [organisationId, otherOrganisationId]) {
      await prisma.organisation.create({
        data: { id, clerkOrgId: id, name: id, currency: "GBP" },
      });
    }

    const customerType = await prisma.customEntityType.create({
      data: {
        organisationId,
        name: "Client",
        fields: [
          {
            name: "name",
            description: "Client name",
            type: "text",
            required: true,
          },
        ],
      },
    });
    customerTypeId = customerType.id;

    const orderType = await prisma.customEntityType.create({
      data: {
        organisationId,
        name: "Order",
        fields: [
          {
            name: "ref",
            description: "Order ref",
            type: "text",
            required: true,
          },
          {
            name: "client",
            description: "Who ordered it",
            type: "reference",
            recordType: "Client",
            required: true,
          },
        ],
      },
    });
    orderTypeId = orderType.id;

    const client = await prisma.customEntityRecord.create({
      data: {
        organisationId,
        entityTypeId: customerTypeId,
        data: { name: "Acme Ltd" },
      },
    });
    customerRecordId = client.id;

    // Same shape, different organisation — the isolation fixture.
    const otherType = await prisma.customEntityType.create({
      data: {
        organisationId: otherOrganisationId,
        name: "Client",
        fields: [
          {
            name: "name",
            description: "Client name",
            type: "text",
            required: true,
          },
        ],
      },
    });
    const otherClient = await prisma.customEntityRecord.create({
      data: {
        organisationId: otherOrganisationId,
        entityTypeId: otherType.id,
        data: { name: "Someone Else Ltd" },
      },
    });
    otherCustomerRecordId = otherClient.id;
  });

  afterAll(async () => {
    const ids = [organisationId, otherOrganisationId];
    await prisma.customEntityRecord.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await prisma.customEntityType.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await prisma.organisation.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("accepts a reference to a real record of the declared type", async () => {
    const order = await entityRecordService.createRecordChecked(
      organisationId,
      orderTypeId,
      { ref: "ORD-1", client: customerRecordId },
    );
    expect(order.id).toBeTruthy();
  });

  it("never accepts a reference to another organisation's record", async () => {
    // The whole reason this validation can't live in the Zod schema: an id
    // alone looks perfectly valid, and storing it would let one business's
    // agent resolve another business's data.
    await expect(
      entityRecordService.createRecordChecked(organisationId, orderTypeId, {
        ref: "ORD-2",
        client: otherCustomerRecordId,
      }),
    ).rejects.toBeInstanceOf(InvalidReferenceError);
  });

  it("rejects a reference to a record of the wrong type", async () => {
    // Without this an Order id could sit in a field declared to point at
    // Clients, and every later resolution would quietly return the wrong
    // shape.
    const order = await entityRecordService.createRecordChecked(
      organisationId,
      orderTypeId,
      { ref: "ORD-3", client: customerRecordId },
    );

    await expect(
      entityRecordService.createRecordChecked(organisationId, orderTypeId, {
        ref: "ORD-4",
        client: order.id,
      }),
    ).rejects.toBeInstanceOf(InvalidReferenceError);
  });

  it("rejects a reference to a record that doesn't exist", async () => {
    await expect(
      entityRecordService.createRecordChecked(organisationId, orderTypeId, {
        ref: "ORD-5",
        client: "no-such-record",
      }),
    ).rejects.toBeInstanceOf(InvalidReferenceError);
  });

  it("resolves a reference to the referenced record on read", async () => {
    const order = await entityRecordService.createRecordChecked(
      organisationId,
      orderTypeId,
      { ref: "ORD-6", client: customerRecordId },
    );

    const resolved = await entityRecordService.getRecordResolved(
      organisationId,
      order.id,
    );
    // An agent sees {order.client.data.name}, not an opaque id it would
    // need a second lookup to make sense of.
    expect(resolved?.data).toMatchObject({
      ref: "ORD-6",
      client: { type: "Client", data: { name: "Acme Ltd" } },
    });
  });

  it("resolves a dangling reference to null rather than failing the read", async () => {
    const order = await entityRecordService.createRecordChecked(
      organisationId,
      orderTypeId,
      { ref: "ORD-7", client: customerRecordId },
    );
    // The target is deleted after the reference was validly stored.
    const temp = await prisma.customEntityRecord.create({
      data: {
        organisationId,
        entityTypeId: customerTypeId,
        data: { name: "Temporary" },
      },
    });
    await entityRecordService.updateRecordChecked(organisationId, order.id, {
      ref: "ORD-7",
      client: temp.id,
    });
    await prisma.customEntityRecord.delete({ where: { id: temp.id } });

    const resolved = await entityRecordService.getRecordResolved(
      organisationId,
      order.id,
    );
    // A read must not fail because a target was removed later — writes are
    // what validation guards, not reads.
    const data = resolved?.data as Record<string, unknown> | undefined;
    expect(data?.client).toBeNull();
  });
});
