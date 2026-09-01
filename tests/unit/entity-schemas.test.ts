import { describe, expect, it } from "vitest";

import {
  buildRecordDataSchema,
  entityFieldsSchema,
} from "@/lib/entities/schemas";

describe("entityFieldsSchema", () => {
  it("accepts a well-formed field list", () => {
    const result = entityFieldsSchema.safeParse([
      { name: "address", description: "the property address" },
    ]);
    expect(result.success).toBe(true);
  });

  it("requires at least one field — a record type with no fields makes no sense", () => {
    const result = entityFieldsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate field names", () => {
    const result = entityFieldsSchema.safeParse([
      { name: "address", description: "first" },
      { name: "address", description: "second" },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("buildRecordDataSchema", () => {
  it("requires every configured field, unlike extraction fields which are all nullable", () => {
    const schema = buildRecordDataSchema([
      { name: "address", description: "d" },
      { name: "tenant", description: "d" },
    ]);

    expect(
      schema.safeParse({ address: "14 Birch Road", tenant: "Jordan" }).success,
    ).toBe(true);
    expect(schema.safeParse({ address: "14 Birch Road" }).success).toBe(false);
    expect(schema.safeParse({ address: "", tenant: "Jordan" }).success).toBe(
      false,
    );
  });
});
