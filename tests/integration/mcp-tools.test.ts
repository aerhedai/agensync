import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as integrationService from "@/lib/integrations/integration-service";
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
    const propertyType = await prisma.customEntityType.create({
      data: {
        organisationId,
        name: "Property",
        fields: [
          { name: "address", description: "the property address" },
          { name: "tenant", description: "the current tenant's name" },
        ],
      },
    });
    await prisma.customEntityRecord.create({
      data: {
        organisationId,
        entityTypeId: propertyType.id,
        data: { address: "14 Birch Road", tenant: "Jordan Reyes" },
      },
    });

    const server = await createMcpServer(organisationId);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await client.close();
    await prisma.product.deleteMany({ where: { organisationId } });
    await prisma.customer.deleteMany({ where: { organisationId } });
    await prisma.customEntityRecord.deleteMany({ where: { organisationId } });
    await prisma.customEntityType.deleteMany({ where: { organisationId } });
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
  });

  it("lists all ten tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "calculate_quote",
      "check_calendar_availability",
      "check_inventory",
      "create_calendar_event",
      "find_customer",
      "find_product",
      "notify_slack",
      "notify_teams",
      "search_custom_entity",
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

  it("send_email reports a tool error when no email account is connected for the organisation", async () => {
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
      {
        type: "text",
        text: expect.stringContaining("No email account (Gmail or Outlook)"),
      },
    ]);
  });

  it("send_email is scoped to the organisation the server was constructed for, not any org the LLM names", async () => {
    // Confirms organisationId can't be smuggled in via tool arguments (the
    // Zod input schema doesn't even accept one) — it's bound at server
    // construction, so a malicious/confused LLM has no channel to target
    // another organisation's email credentials (CLAUDE.md #22).
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
      {
        type: "text",
        text: expect.stringContaining("No email account (Gmail or Outlook)"),
      },
    ]);
  });

  it("send_email uses Outlook when only Outlook is connected", async () => {
    await integrationService.connectOAuthAccount(organisationId, "outlook", {
      accountName: "sales@acme.test",
      config: { email: "sales@acme.test" },
      credentials: {
        accessToken: "access-outlook",
        refreshToken: "refresh-outlook",
      },
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.callTool({
      name: "send_email",
      arguments: {
        to: "buyer@customer-abc.test",
        subject: "Your quote",
        body: "£7,500 for 500 units of Product A.",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ sent: true });
  });

  it("send_email picks the earliest-connected account when both Gmail and Outlook are connected, not Gmail by default", async () => {
    // Outlook connected first — must still win, proving there's no
    // hardcoded "Gmail always wins" priority.
    await integrationService.connectOAuthAccount(organisationId, "outlook", {
      accountName: "outlook@acme.test",
      config: { email: "outlook@acme.test" },
      credentials: {
        accessToken: "access-outlook",
        refreshToken: "refresh-outlook",
      },
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await integrationService.connectGmailAccount(
      organisationId,
      "gmail@acme.test",
      {
        accessToken: "access-gmail",
        refreshToken: "refresh-gmail",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.callTool({
      name: "send_email",
      arguments: {
        to: "buyer@customer-abc.test",
        subject: "Your quote",
        body: "£7,500 for 500 units of Product A.",
      },
    });

    expect(result.isError).toBeFalsy();
    // Outlook's sendMail hits /me/sendMail — confirms Outlook's client was
    // used, not Gmail's.
    const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(calledUrl).toContain("/sendMail");
  });

  it("notify_slack reports a tool error when Slack isn't connected for the organisation", async () => {
    const result = await client.callTool({
      name: "notify_slack",
      arguments: { channel: "#general", message: "A quote needs approval." },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining("Slack is not connected") },
    ]);
  });

  it("notify_slack is scoped to the organisation the server was constructed for, not any org the LLM names", async () => {
    const result = await client.callTool({
      name: "notify_slack",
      arguments: {
        channel: "#general",
        message: "A quote needs approval.",
        organisationId: "some-other-org",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining("Slack is not connected") },
    ]);
  });

  it("notify_teams reports a tool error when Teams isn't connected for the organisation", async () => {
    const result = await client.callTool({
      name: "notify_teams",
      arguments: {
        teamId: "team-1",
        channelId: "channel-1",
        message: "A quote needs approval.",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining("Teams is not connected") },
    ]);
  });

  it("notify_teams is scoped to the organisation the server was constructed for, not any org the LLM names", async () => {
    const result = await client.callTool({
      name: "notify_teams",
      arguments: {
        teamId: "team-1",
        channelId: "channel-1",
        message: "A quote needs approval.",
        organisationId: "some-other-org",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining("Teams is not connected") },
    ]);
  });

  it("check_calendar_availability reports a tool error when Outlook Calendar isn't connected", async () => {
    const result = await client.callTool({
      name: "check_calendar_availability",
      arguments: {
        attendees: ["buyer@customer-abc.test"],
        durationMinutes: 30,
        rangeStart: "2026-09-02T09:00:00.000Z",
        rangeEnd: "2026-09-02T17:00:00.000Z",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      {
        type: "text",
        text: expect.stringContaining("Outlook Calendar is not connected"),
      },
    ]);
  });

  it("create_calendar_event reports a tool error when Outlook Calendar isn't connected", async () => {
    const result = await client.callTool({
      name: "create_calendar_event",
      arguments: {
        subject: "Quote review",
        start: "2026-09-02T09:00:00.000Z",
        end: "2026-09-02T09:30:00.000Z",
        attendees: ["buyer@customer-abc.test"],
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      {
        type: "text",
        text: expect.stringContaining("Outlook Calendar is not connected"),
      },
    ]);
  });

  it("create_calendar_event is scoped to the organisation the server was constructed for, not any org the LLM names", async () => {
    const result = await client.callTool({
      name: "create_calendar_event",
      arguments: {
        subject: "Quote review",
        start: "2026-09-02T09:00:00.000Z",
        end: "2026-09-02T09:30:00.000Z",
        attendees: ["buyer@customer-abc.test"],
        organisationId: "some-other-org",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      {
        type: "text",
        text: expect.stringContaining("Outlook Calendar is not connected"),
      },
    ]);
  });

  it("search_custom_entity finds a record by any field, not just a fixed one", async () => {
    const result = await client.callTool({
      name: "search_custom_entity",
      arguments: { entityType: "Property", query: "Birch" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      found: true,
      records: [{ data: { address: "14 Birch Road", tenant: "Jordan Reyes" } }],
    });
  });

  it("search_custom_entity matches on a field other than the first one", async () => {
    const result = await client.callTool({
      name: "search_custom_entity",
      arguments: { entityType: "Property", query: "Jordan Reyes" },
    });

    expect(result.structuredContent).toMatchObject({ found: true });
  });

  it("search_custom_entity reports not found for no match", async () => {
    const result = await client.callTool({
      name: "search_custom_entity",
      arguments: { entityType: "Property", query: "nonexistent" },
    });

    expect(result.structuredContent).toEqual({ found: false, records: [] });
  });

  it("search_custom_entity errors clearly for an entity type that doesn't exist", async () => {
    const result = await client.callTool({
      name: "search_custom_entity",
      arguments: { entityType: "NotARealType", query: "anything" },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject([
      {
        type: "text",
        text: expect.stringContaining(
          'No custom entity type named "NotARealType"',
        ),
      },
    ]);
  });
});
