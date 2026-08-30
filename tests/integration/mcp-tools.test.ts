import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { createMcpServer } from "@/lib/mcp/server";

// Real MCP protocol round trip (list + call, real Zod validation, real
// handlers) over an in-memory transport pair — no network, deterministic,
// CI-safe, but not a mock: this is the actual client/server/protocol code.
// The four lookup tools are now DB-backed per organisation (no more shared
// lib/mcp/mock-data.ts), so each test run gets its own fixture rows.
describe("MCP tool server", () => {
  let client: Client;
  const organisationId = "test-org-mcp-tools";

  beforeEach(async () => {
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "MCP Tools Test Org",
        currency: "GBP",
      },
    });
    await prisma.product.create({
      data: {
        id: "prod-1",
        organisationId,
        sku: "WIDGET-A",
        name: "Product A",
        unitPrice: 15,
        stockQuantity: 700,
      },
    });
    await prisma.customer.create({
      data: {
        organisationId,
        name: "Customer ABC",
        email: "buyer@customer-abc.test",
        company: "Customer ABC Ltd",
      },
    });

    const server = createMcpServer(organisationId);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await prisma.product.deleteMany({ where: { organisationId } });
    await prisma.customer.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
  });

  it("lists all five tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "calculate_quote",
      "check_inventory",
      "find_customer",
      "find_product",
      "send_email",
    ]);
  });

  it("find_customer finds a known customer", async () => {
    const result = await client.callTool({
      name: "find_customer",
      arguments: { query: "Customer ABC" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      found: true,
      customer: { name: "Customer ABC" },
    });
  });

  it("find_customer reports not found for an unknown query", async () => {
    const result = await client.callTool({
      name: "find_customer",
      arguments: { query: "nonexistent" },
    });

    expect(result.structuredContent).toEqual({ found: false, customer: null });
  });

  it("find_product finds a known product", async () => {
    const result = await client.callTool({
      name: "find_product",
      arguments: { query: "Product A" },
    });

    expect(result.structuredContent).toMatchObject({
      found: true,
      product: { sku: "WIDGET-A", unitPrice: 15 },
    });
  });

  it("check_inventory returns the available quantity", async () => {
    const result = await client.callTool({
      name: "check_inventory",
      arguments: { productId: "prod-1" },
    });

    expect(result.structuredContent).toEqual({
      productId: "prod-1",
      quantityAvailable: 700,
    });
  });

  it("calculate_quote matches CLAUDE.md's worked example: 500 units of Product A = £7,500", async () => {
    const result = await client.callTool({
      name: "calculate_quote",
      arguments: { productId: "prod-1", quantity: 500 },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      productId: "prod-1",
      quantity: 500,
      unitPrice: 15,
      total: 7500,
      currency: "GBP",
    });
  });

  it("calculate_quote falls back to a name/SKU match when given a product name instead of an id", async () => {
    // Regression test for a real Phase 9 live-testing failure: the model
    // called find_product first (getting back id "prod-1") but then passed
    // find_product's *query* ("Product A") to calculate_quote instead of
    // the id it had just been given — this must still resolve correctly.
    const result = await client.callTool({
      name: "calculate_quote",
      arguments: { productId: "Product A", quantity: 500 },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      productId: "prod-1",
      quantity: 500,
      unitPrice: 15,
      total: 7500,
      currency: "GBP",
    });
  });

  it("calculate_quote reports a tool-level error for an unknown product", async () => {
    const result = await client.callTool({
      name: "calculate_quote",
      arguments: { productId: "does-not-exist", quantity: 1 },
    });

    expect(result.isError).toBe(true);
  });

  it("reports invalid input as a tool error before the handler runs", async () => {
    const result = await client.callTool({
      name: "calculate_quote",
      arguments: { productId: "prod-1", quantity: -5 },
    });

    expect(result.isError).toBe(true);
  });

  it("send_email reports a tool error when Gmail isn't connected for the organisation", async () => {
    const result = await client.callTool({
      name: "send_email",
      arguments: {
        to: "buyer@customer-abc.test",
        subject: "Your quote",
        body: "£7,500 for 500 units of Product A.",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining("Gmail is not connected") },
    ]);
  });

  it("send_email is scoped to the organisation the server was constructed for, not any org the LLM names", async () => {
    // Confirms organisationId can't be smuggled in via tool arguments (the
    // Zod input schema doesn't even accept one) — it's bound at server
    // construction, so a malicious/confused LLM has no channel to target
    // another organisation's Gmail credentials (CLAUDE.md #22).
    const result = await client.callTool({
      name: "send_email",
      arguments: {
        to: "buyer@customer-abc.test",
        subject: "Your quote",
        body: "£7,500 for 500 units of Product A.",
        organisationId: "some-other-org",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining("Gmail is not connected") },
    ]);
  });
});
