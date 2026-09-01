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

// Both Complaints and General Inquiry are now the same "acknowledge_reply"
// pipeline (lib/harness/pipelines/acknowledge-reply-pipeline.ts) —
// data-driven, not separate code files. These are the extraction
// fields/guardrail that reproduce their pre-generalization behaviour
// exactly, used both for new-org provisioning and as a reference point
// for a business defining their own category from scratch.
export const DEFAULT_COMPLAINTS_EXTRACTION_FIELDS = [
  {
    name: "complaintSummary",
    description: "a short one-sentence summary of what they are unhappy about",
  },
];

// Case-insensitive substring match (lib/harness/pipeline-guards.ts) — a
// composed reply containing any of these is refused, never proposed for
// approval. Stems ("compensat", "waive") rather than exact words, so this
// still catches "compensation"/"compensate" and "waived"/"waives" the way
// the original regex this replaces did.
export const DEFAULT_COMPLAINTS_GUARDRAIL_KEYWORDS = [
  "refund",
  "reimburse",
  "replacement",
  "discount",
  "compensat",
  "free item",
  "free product",
  "money back",
  "waive",
];

export const DEFAULT_GENERAL_EXTRACTION_FIELDS = [
  {
    name: "question",
    description: "a short summary of what they are asking",
  },
];
