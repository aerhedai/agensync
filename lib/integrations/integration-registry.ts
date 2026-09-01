// The single canonical list of valid integration providers — same
// reasoning as lib/mcp/tool-registry.ts: Integration.provider is a plain
// string column, not a Postgres enum (a migration per new provider isn't
// worth it), so this is what actually constrains which values are real.
export const INTEGRATION_REGISTRY = [
  {
    provider: "gmail",
    label: "Gmail",
    description:
      "Connect a Gmail address to trigger agents from labelled inbound email, and to send replies.",
  },
] as const;

export type IntegrationProviderName =
  (typeof INTEGRATION_REGISTRY)[number]["provider"];
