import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as entityRecordService from "@/lib/entities/entity-record-service";
import * as entityTypeService from "@/lib/entities/entity-type-service";

// Exercises the "add and remove your own catalog" surface directly at the
// service layer — the entity-type-form.tsx and delete-*.tsx components are
// thin wrappers over these same calls, so this is what actually needs to
// behave correctly for the catalog to be genuinely business-configurable
// (create, rename, add/remove fields, delete a type and everything under
// it, delete one record), not just business-seedable once.
// A plain required text field, written the way the entity type form
// submits one. Typed fields added `type` and `required`; this keeps these
// tests terse while still exercising the real parsed shape.
function textField(name: string, description: string) {
  return { name, description, type: "text" as const, required: true };
}

describe("custom entity catalog CRUD", () => {
  const organisationId = "test-org-entity-crud";
  const otherOrganisationId = "test-org-entity-crud-other";

  beforeEach(async () => {
    await prisma.customEntityRecord.deleteMany({
      where: { organisationId: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.customEntityType.deleteMany({
      where: { organisationId: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.organisation.deleteMany({
      where: { id: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Entity CRUD Test Org",
        currency: "GBP",
      },
    });
    await prisma.organisation.create({
      data: {
        id: otherOrganisationId,
        clerkOrgId: otherOrganisationId,
        name: "Entity CRUD Test Org (other)",
        currency: "GBP",
      },
    });
  });

  afterAll(async () => {
    await prisma.customEntityRecord.deleteMany({
      where: { organisationId: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.customEntityType.deleteMany({
      where: { organisationId: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.organisation.deleteMany({
      where: { id: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.$disconnect();
  });

  it("creates an entity type with the fields a business defines for itself", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      {
        name: "Property",
        fields: [
          textField("address", "the property's full address"),
          textField("tenant", "the current tenant's name"),
        ],
      },
    );

    expect(entityType.name).toBe("Property");
    expect(entityType.fields).toEqual([
      textField("address", "the property's full address"),
      textField("tenant", "the current tenant's name"),
    ]);
  });

  it("renames a type and changes its field list in place", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      {
        name: "Job",
        fields: [textField("jobId", "the job id")],
      },
    );

    const updated = await entityTypeService.updateEntityType(
      organisationId,
      entityType.id,
      {
        name: "Job Record",
        fields: [
          textField("jobId", "the job id"),
          textField("rootFolder", "the archive root folder"),
        ],
      },
    );

    expect(updated).toBe(true);
    const reloaded = await entityTypeService.getEntityType(
      organisationId,
      entityType.id,
    );
    expect(reloaded?.name).toBe("Job Record");
    expect(reloaded?.fields).toHaveLength(2);
  });

  it("existing records keep data under a field that's since been removed from the type", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      {
        name: "Case",
        fields: [
          textField("caseId", "the case id"),
          textField("notes", "free-text notes"),
        ],
      },
    );
    const record = await entityRecordService.createRecord(
      organisationId,
      entityType.id,
      { caseId: "C-1", notes: "some notes" },
    );

    await entityTypeService.updateEntityType(organisationId, entityType.id, {
      name: "Case",
      fields: [textField("caseId", "the case id")],
    });

    const records = await entityRecordService.listRecords(
      organisationId,
      entityType.id,
    );
    const reloaded = records.find((r) => r.id === record.id);
    // The now-removed "notes" field's data is still there — dropped from
    // the schema, not silently erased from data already collected.
    expect(reloaded?.data).toMatchObject({
      caseId: "C-1",
      notes: "some notes",
    });
  });

  it("does not update an entity type belonging to a different organisation", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      { name: "Property", fields: [textField("address", "x")] },
    );

    const updated = await entityTypeService.updateEntityType(
      otherOrganisationId,
      entityType.id,
      { name: "Hijacked", fields: [textField("address", "x")] },
    );

    expect(updated).toBe(false);
    const reloaded = await entityTypeService.getEntityType(
      organisationId,
      entityType.id,
    );
    expect(reloaded?.name).toBe("Property");
  });

  it("deleting an entity type cascades to its records", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      { name: "Case", fields: [textField("caseId", "x")] },
    );
    await entityRecordService.createRecord(organisationId, entityType.id, {
      caseId: "C-1",
    });
    await entityRecordService.createRecord(organisationId, entityType.id, {
      caseId: "C-2",
    });

    const deleted = await entityTypeService.deleteEntityType(
      organisationId,
      entityType.id,
    );

    expect(deleted).toBe(true);
    const remainingRecords = await prisma.customEntityRecord.findMany({
      where: { entityTypeId: entityType.id },
    });
    expect(remainingRecords).toHaveLength(0);
    const reloaded = await entityTypeService.getEntityType(
      organisationId,
      entityType.id,
    );
    expect(reloaded).toBeNull();
  });

  it("does not delete an entity type belonging to a different organisation", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      { name: "Property", fields: [textField("address", "x")] },
    );

    const deleted = await entityTypeService.deleteEntityType(
      otherOrganisationId,
      entityType.id,
    );

    expect(deleted).toBe(false);
    const reloaded = await entityTypeService.getEntityType(
      organisationId,
      entityType.id,
    );
    expect(reloaded).not.toBeNull();
  });

  it("deletes one record without affecting its siblings", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      { name: "Case", fields: [textField("caseId", "x")] },
    );
    const keep = await entityRecordService.createRecord(
      organisationId,
      entityType.id,
      { caseId: "keep" },
    );
    const remove = await entityRecordService.createRecord(
      organisationId,
      entityType.id,
      { caseId: "remove" },
    );

    const deleted = await entityRecordService.deleteRecord(
      organisationId,
      remove.id,
    );

    expect(deleted).toBe(true);
    const remaining = await entityRecordService.listRecords(
      organisationId,
      entityType.id,
    );
    expect(remaining.map((r) => r.id)).toEqual([keep.id]);
  });

  it("does not delete a record belonging to a different organisation", async () => {
    const entityType = await entityTypeService.createEntityType(
      organisationId,
      { name: "Case", fields: [textField("caseId", "x")] },
    );
    const record = await entityRecordService.createRecord(
      organisationId,
      entityType.id,
      { caseId: "C-1" },
    );

    const deleted = await entityRecordService.deleteRecord(
      otherOrganisationId,
      record.id,
    );

    expect(deleted).toBe(false);
    const remaining = await entityRecordService.listRecords(
      organisationId,
      entityType.id,
    );
    expect(remaining).toHaveLength(1);
  });
});
