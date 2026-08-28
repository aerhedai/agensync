import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMcpServer } from "@/lib/mcp/server";

// Real MCP protocol round trip (list + call, real Zod validation, real
// handlers) over an in-memory transport pair — no network, deterministic,
// CI-safe, but not a mock: this is the actual client/server/protocol code.
describe("MCP tool server", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createMcpServer();
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
  });

  it("lists all four tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "calculate_quote",
      "check_inventory",
      "find_customer",
      "find_product",
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
});
