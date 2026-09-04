import { describe, expect, it } from "vitest";

import { agentInputSchema } from "@/lib/agents/schemas";
import {
  resolveCategoryType,
  validatePipelineConfig,
} from "@/lib/agents/pipeline-config-form";

// Regression tests for a production bug: creating any new agent, and
// editing any agent already on the generic step pipeline, silently failed
// to save. The generic agent form only renders a categoryType hidden input
// for legacy agents, so every other submission sent the field absent —
// FormData.get returns null for that, not undefined, and
// categoryTypeSchema's .default("steps") never catches null. Validation
// failed with a categoryType field error that nothing in the form
// rendered, so the page just sat there with no visible sign anything was
// wrong.
describe("resolveCategoryType", () => {
  it("resolves an absent field (what every new agent submits) to steps", () => {
    const formData = new FormData();
    expect(resolveCategoryType(formData)).toBe("steps");
  });

  it("resolves an empty string the same way", () => {
    const formData = new FormData();
    formData.set("categoryType", "");
    expect(resolveCategoryType(formData)).toBe("steps");
  });

  it("passes through a real value unchanged, e.g. a legacy agent's pipelineKey", () => {
    const formData = new FormData();
    formData.set("categoryType", "quote");
    expect(resolveCategoryType(formData)).toBe("quote");
  });
});

describe("the full submission this bug broke", () => {
  const stepsProgramme = {
    steps: [{ kind: "extract", fields: [{ name: "x", description: "y" }] }],
  };

  it("agentInputSchema rejects the raw FormData null Zod's default() can't catch", () => {
    // This is exactly the object parseAgentForm built before the fix: a raw
    // formData.get("categoryType") result spread straight into the parse
    // input, unmodified.
    const result = agentInputSchema.safeParse({
      name: "Invoice Agent",
      description: "Files invoices",
      instructions: "Extract and file.",
      model: "qwen2.5:14b",
      categoryType: null,
      replySubjectTemplate: "",
      keywords: [],
      toolNames: ["create_record"],
      extractionFields: [],
      guardrailKeywords: [],
      actionIntegrationId: "",
      pipelineConfig: stepsProgramme,
    });
    expect(result.success).toBe(false);
  });

  it("resolveCategoryType fixes that: the schema now accepts and defaults to steps", () => {
    const formData = new FormData();
    // categoryType deliberately not set — matches what the browser submits
    // for a brand-new agent.
    const result = agentInputSchema.safeParse({
      name: "Invoice Agent",
      description: "Files invoices",
      instructions: "Extract and file.",
      model: "qwen2.5:14b",
      categoryType: resolveCategoryType(formData),
      replySubjectTemplate: "",
      keywords: [],
      toolNames: ["create_record"],
      extractionFields: [],
      guardrailKeywords: [],
      actionIntegrationId: "",
      pipelineConfig: stepsProgramme,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineKey).toBe("steps");
      expect(result.data.executionMode).toBe("HARNESS");
    }
  });

  it("the second half of the bug: validatePipelineConfig on the raw absent field silently discards the step programme", () => {
    const formData = new FormData();
    const raw = formData.get("categoryType"); // null — the pre-fix call site
    const validated = validatePipelineConfig(raw as never, stepsProgramme);
    // None of validatePipelineConfig's branches match null, so it falls
    // through to the catch-all { config: {} } — the submitted steps vanish
    // without an error, which is worse than the outright rejection above:
    // an agent would be created, just a broken one with no steps.
    expect(validated).toEqual({ config: {} });
  });

  it("resolveCategoryType fixes that too: the real step programme survives validation", () => {
    const formData = new FormData();
    const validated = validatePipelineConfig(
      resolveCategoryType(formData) as never,
      stepsProgramme,
    );
    expect("config" in validated && validated.config).toEqual(stepsProgramme);
  });
});

describe("resolveCategoryType for a LOOP agent's hidden field", () => {
  it("a LOOP agent's explicit 'loop' value round-trips correctly", () => {
    // The agent form sends categoryType="loop" explicitly for a LOOP agent
    // (agent-form.tsx) — pipelineKey is null for LOOP, which is
    // indistinguishable from "field absent" once it becomes the empty
    // string an <input value={agent.pipelineKey ?? ""}> would otherwise
    // submit, so "loop" has to be spelled out rather than reused from
    // pipelineKey.
    const formData = new FormData();
    formData.set("categoryType", "loop");
    expect(resolveCategoryType(formData)).toBe("loop");

    const result = agentInputSchema.safeParse({
      name: "Inbox Classifier",
      description: "Classifies inbound email.",
      instructions: "Classify the message.",
      model: "qwen2.5:14b",
      categoryType: resolveCategoryType(formData),
      replySubjectTemplate: "",
      keywords: [],
      toolNames: [],
      extractionFields: [],
      guardrailKeywords: [],
      actionIntegrationId: "",
      pipelineConfig: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.executionMode).toBe("LOOP");
      expect(result.data.pipelineKey).toBeNull();
    }
  });
});
