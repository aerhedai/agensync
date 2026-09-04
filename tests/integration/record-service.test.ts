import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  UnknownRecordTypeError,
  findRecord,
  listRecordTypeNames,
  resolveWritableType,
  searchRecords,
} from "@/lib/records/record-service";
import { createRecord } from "@/tests/helpers/records";

// The record service is what makes Product/Customer and business-defined
// types addressable through one vocabulary (CLAUDE.md §4.3). These tests
// lock in the two properties that matter most: built-in and custom types
// come back in the *same* envelope, and one organisation can never read
// another's records through it.
const organisationId = "record-service-test-org";
const otherOrganisationId = "record-service-other-org";

describe("record service", () => {
  beforeAll(async () => {
    for (const id of [organisationId, otherOrganisationId]) {
      await prisma.organisation.create({
        data: { id, clerkOrgId: `clerk-${id}`, name: id, currency: "GBP" },
      });
    }

    await createRecord(organisationId, "Product", {
      sku: "RS-WIDGET",
      name: "Record Service Widget",
      unitPrice: 12.5,
      stockQuantity: 42,
    });
    await createRecord(organisationId, "Customer", {
      name: "Recordy McRecordface",
      email: "buyer@record-service.test",
      company: "Record Co",
    });

    const jobType = await prisma.customEntityType.create({
      data: {
        id: "rs-type-job",
        organisationId,
        name: "Job",
        fields: [
          { name: "jobId", description: "The job reference" },
          { name: "status", description: "Where the job has got to" },
        ],
      },
    });
    await prisma.customEntityRecord.create({
      data: {
        id: "rs-job-1",
        organisationId,
        entityTypeId: jobType.id,
        data: { jobId: "1042", status: "Ready" },
      },
    });

    // Same type name, different organisation — the isolation fixture.
    const otherType = await prisma.customEntityType.create({
      data: {
        id: "rs-type-job-other",
        organisationId: otherOrganisationId,
        name: "Job",
        fields: [{ name: "jobId", description: "The job reference" }],
      },
    });
    await prisma.customEntityRecord.create({
      data: {
        id: "rs-job-other",
        organisationId: otherOrganisationId,
        entityTypeId: otherType.id,
        data: { jobId: "9999", status: "Secret" },
      },
    });
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
  });

  it("returns built-in and custom types in the same envelope", async () => {
    const product = await findRecord(
      organisationId,
      "Product",
      "sku",
      "RS-WIDGET",
    );
    const job = await findRecord(organisationId, "Job", "jobId", "1042");

    // Identical shape, different source table — this is the property that
    // lets Product/Customer become ordinary record types later without the
    // tool layer above changing at all.
    for (const record of [product, job]) {
      expect(record).toMatchObject({
        id: expect.any(String),
        type: expect.any(String),
        data: expect.any(Object),
      });
    }
    expect(product?.type).toBe("Product");
    expect(job?.type).toBe("Job");
  });

  it("exposes stock as an ordinary field rather than a separate lookup", async () => {
    const product = await findRecord(
      organisationId,
      "Product",
      "sku",
      "RS-WIDGET",
    );
    expect(product?.data).toMatchObject({ unitPrice: 12.5, stockQuantity: 42 });
  });

  it("matches a built-in type name case-insensitively, as a model might write it", async () => {
    const record = await findRecord(
      organisationId,
      "product",
      "sku",
      "RS-WIDGET",
    );
    expect(record?.type).toBe("Product");
  });

  it("never returns another organisation's record for the same type name", async () => {
    const found = await findRecord(organisationId, "Job", "jobId", "9999");
    expect(found).toBeNull();

    const searched = await searchRecords(organisationId, "Job", "Secret");
    expect(searched).toEqual([]);
  });

  it("distinguishes an unknown type from a type with no matching row", async () => {
    // Collapsing these would let a misconfigured agent look like it is
    // working correctly against an empty dataset.
    await expect(
      findRecord(organisationId, "Sprocket", "id", "x"),
    ).rejects.toBeInstanceOf(UnknownRecordTypeError);

    await expect(
      findRecord(organisationId, "Job", "jobId", "does-not-exist"),
    ).resolves.toBeNull();
  });

  it("lists every record type this organisation has, with no privileged ones", async () => {
    // Product and Customer used to be prepended as built-ins ahead of the
    // business's own types. They are ordinary rows now, so this is one
    // uniform list and nothing here knows which came from a template.
    const names = await listRecordTypeNames(organisationId);
    expect([...names].sort()).toEqual(["Customer", "Job", "Product"]);
  });

  it("lets an agent write to Product, which used to be refused outright", async () => {
    // The old built-in tables refused agent writes: Product.unitPrice was a
    // Decimal column and an untyped bag from a model could not safely
    // populate it. Typed fields removed that reason and the collapse removed
    // the column, so this is now an ordinary writable record type — the
    // single most visible consequence of the change.
    await expect(
      resolveWritableType(organisationId, "Product"),
    ).resolves.toMatchObject({ name: "Product" });

    await expect(
      resolveWritableType(organisationId, "Job"),
    ).resolves.toMatchObject({ name: "Job" });
  });

  it("still refuses a type that does not exist", async () => {
    // The useful half of the old refusal has to survive: naming a type that
    // isn't there is a different failure from finding no rows, and
    // collapsing the two would let a misconfigured agent look like it was
    // working against empty data.
    await expect(
      resolveWritableType(organisationId, "NotARealType"),
    ).rejects.toBeInstanceOf(UnknownRecordTypeError);
  });
});
