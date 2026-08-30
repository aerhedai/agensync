// Shared defaults for provisioning a new organisation's Email Handling
// workflow — used both by the lazy-provisioning path
// (lib/organisations/current-organisation.ts, triggered by a real Clerk
// sign-in) and previously duplicated across prisma/seed.ts's two demo
// organisations. One copy instead of three.
export const DEFAULT_AGENT_MODEL = "qwen2.5:14b";

export const DEFAULT_QUOTE_KEYWORDS = [
  "quote",
  "price",
  "pricing",
  "how much",
  "cost of",
];

export const DEFAULT_COMPLAINTS_KEYWORDS = [
  "complaint",
  "complain",
  "unhappy",
  "disappointed",
  "damaged",
  "broken",
  "refund",
];
