import { describe, expect, it } from "vitest";

import {
  buildRecordDataSchema,
  entityFieldsSchema,
  type EntityFieldConfig,
} from "@/lib/entities/schemas";

// Parses a raw field list the way every real call site does
// (entityFieldsSchema.parse(entityType.fields)) rather than hand-building
// the typed shape — so these tests exercise the same path production does,
// including the untyped-legacy preprocessing.
function fields(raw: unknown[]): EntityFieldConfig[] {
  return entityFieldsSchema.parse(raw);
}

describe("entityFieldsSchema", () => {
  it("accepts a well-formed field list", () => {
    const result = entityFieldsSchema.safeParse([
      { name: "address", description: "the property address", type: "text" },
    ]);
    expect(result.success).toBe(true);
  });

  it("defaults an untyped legacy field to text rather than rejecting it", () => {
    // Field definitions written before types existed have no `type` key.
    // They must keep working untouched — "text" is exactly how they
    // already behaved.
    const result = entityFieldsSchema.safeParse([
      { name: "address", description: "the property address" },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toMatchObject({ type: "text", required: true });
    }
  });

  it("requires at least one field — a record type with no fields makes no sense", () => {
    expect(entityFieldsSchema.safeParse([]).success).toBe(false);
  });

  it("rejects duplicate field names", () => {
    const result = entityFieldsSchema.safeParse([
      { name: "address", description: "first" },
      { name: "address", description: "second" },
    ]);
    expect(result.success).toBe(false);
  });

  it("requires a select field to declare its options", () => {
    expect(
      entityFieldsSchema.safeParse([
        { name: "status", description: "d", type: "select" },
      ]).success,
    ).toBe(false);
    expect(
      entityFieldsSchema.safeParse([
        {
          name: "status",
          description: "d",
          type: "select",
          options: ["Open", "Closed"],
        },
      ]).success,
    ).toBe(true);
  });

  it("requires a reference field to name the type it points at", () => {
    expect(
      entityFieldsSchema.safeParse([
        { name: "customer", description: "d", type: "reference" },
      ]).success,
    ).toBe(false);
    expect(
      entityFieldsSchema.safeParse([
        {
          name: "customer",
          description: "d",
          type: "reference",
          recordType: "Customer",
        },
      ]).success,
    ).toBe(true);
  });
});

describe("buildRecordDataSchema", () => {
  it("requires every field by default, matching pre-types behaviour", () => {
    const schema = buildRecordDataSchema(
      fields([
        { name: "address", description: "d" },
        { name: "tenant", description: "d" },
      ]),
    );

    expect(
      schema.safeParse({ address: "14 Birch Road", tenant: "Jordan" }).success,
    ).toBe(true);
    expect(schema.safeParse({ address: "14 Birch Road" }).success).toBe(false);
    expect(schema.safeParse({ address: "", tenant: "Jordan" }).success).toBe(
      false,
    );
  });

  it("lets an optional field be absent or blank without storing an empty string", () => {
    const schema = buildRecordDataSchema(
      fields([
        { name: "address", description: "d" },
        { name: "notes", description: "d", required: false },
      ]),
    );

    const absent = schema.safeParse({ address: "14 Birch Road" });
    expect(absent.success).toBe(true);

    const blank = schema.safeParse({ address: "14 Birch Road", notes: "" });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.notes).toBeUndefined();
  });

  it("stores a number as a real number, not the string a form submits", () => {
    // This is the whole point of typed fields: compute/branch/policies
    // can't compare against a quantity stored as text.
    const schema = buildRecordDataSchema(
      fields([{ name: "quantity", description: "d", type: "number" }]),
    );
    const result = schema.safeParse({ quantity: "500" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(500);

    expect(schema.safeParse({ quantity: "not a number" }).success).toBe(false);
  });

  it("rounds currency to whole pence so stored money carries no float dust", () => {
    const schema = buildRecordDataSchema(
      fields([{ name: "total", description: "d", type: "currency" }]),
    );
    const result = schema.safeParse({ total: "450.005" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.total).toBe(450.01);
  });

  it("normalises a date to ISO so stored dates sort and compare consistently", () => {
    const schema = buildRecordDataSchema(
      fields([{ name: "due", description: "d", type: "date" }]),
    );
    const result = schema.safeParse({ due: "2026-01-15" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.due).toBe("2026-01-15T00:00:00.000Z");
    }
    expect(schema.safeParse({ due: "not a date" }).success).toBe(false);
  });

  it("accepts a checkbox's 'on' as a real boolean", () => {
    // HTML forms never submit a real boolean, so an unconverted "on"
    // would fail validation on every checkbox.
    const schema = buildRecordDataSchema(
      fields([{ name: "paid", description: "d", type: "boolean" }]),
    );
    const result = schema.safeParse({ paid: "on" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paid).toBe(true);
    expect(schema.safeParse({ paid: true }).success).toBe(true);
  });

  it("restricts a select field to its declared options", () => {
    // A free-text status means "Ready", "ready" and "READY" are three
    // different statuses, silently breaking any branch keyed on it.
    const schema = buildRecordDataSchema(
      fields([
        {
          name: "status",
          description: "d",
          type: "select",
          options: ["Ready", "Approved"],
        },
      ]),
    );
    expect(schema.safeParse({ status: "Ready" }).success).toBe(true);
    expect(schema.safeParse({ status: "ready" }).success).toBe(false);
    expect(schema.safeParse({ status: "Anything" }).success).toBe(false);
  });

  it("accepts a reference as a record id string", () => {
    const schema = buildRecordDataSchema(
      fields([
        {
          name: "customer",
          description: "d",
          type: "reference",
          recordType: "Customer",
        },
      ]),
    );
    expect(schema.safeParse({ customer: "rec_123" }).success).toBe(true);
    expect(schema.safeParse({ customer: "" }).success).toBe(false);
  });
});
