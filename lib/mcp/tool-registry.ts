// The single canonical list of valid tool names — previously scattered as
// string literals across lib/mcp/server.ts, each tool file's own `name`
// field, and AgentTool.toolName values with nothing tying them together.
// Every tool file imports its name from here; the agent-tool UI (which
// tools a business can grant an agent) and its Zod validation both read
// from this list too, so a submitted tool name that isn't real can't reach
// the database.
export const TOOL_REGISTRY = [
  {
    name: "find_customer",
    label: "Find customer",
    description: "Look up a customer by name, email, or company.",
  },
  {
    name: "find_product",
    label: "Find product",
    description: "Look up a product by name or SKU.",
  },
  {
    name: "check_inventory",
    label: "Check inventory",
    description: "Check available stock for a product.",
  },
  {
    name: "calculate_quote",
    label: "Calculate quote",
    description: "Calculate a price quote for a product and quantity.",
  },
  {
    name: "send_email",
    label: "Send email",
    description:
      "Send an email reply via whichever email account is connected (Gmail or Outlook) — always requires approval.",
  },
  {
    name: "notify_slack",
    label: "Notify Slack",
    description:
      "Post an internal notification to a Slack channel, e.g. to alert a human that something needs attention.",
  },
  {
    name: "notify_teams",
    label: "Notify Teams",
    description:
      "Post an internal notification to a Microsoft Teams channel. Posts as whichever person connected the account, not as a separate bot.",
  },
  {
    name: "check_calendar_availability",
    label: "Check calendar availability",
    description:
      "Find suggested meeting times for a set of attendees using the connected Outlook Calendar.",
  },
  {
    name: "create_calendar_event",
    label: "Create calendar event",
    description:
      "Create a real Outlook Calendar event and invite attendees — always requires approval.",
  },
  {
    name: "search_custom_entity",
    label: "Search custom entity",
    description:
      "Look up a record in one of this business's own custom entity types (e.g. Property, Case).",
  },
] as const;

export type ToolName = (typeof TOOL_REGISTRY)[number]["name"];

export const TOOL_NAMES = TOOL_REGISTRY.map((t) => t.name) as [
  ToolName,
  ...ToolName[],
];
