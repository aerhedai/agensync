import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type { AIProvider } from "@/lib/ai/provider";
import type { Agent, Organisation } from "@/lib/generated/prisma/client";
import type { RunResult } from "@/lib/runtime/agent-runtime";

export interface PipelineContext {
  runId: string;
  organisationId: string;
  // Fetched once per run in run-harness-pipeline.ts, not per pipeline
  // step — one extra query per run, used for the compose sign-off
  // (organisation.name) and available for any other per-org fact a
  // pipeline needs (e.g. currency, though quote-pipeline currently sources
  // that from calculate_quote's own result instead — see that file).
  organisation: Organisation;
  agent: Agent;
  input: string;
  // The message's sender, known structurally from the trigger (e.g.
  // Gmail's own "from" field) — never something a pipeline has to guess
  // by scanning free text. Identification only (who to look up, who to
  // reply to): never fed into classification or extraction prompts, so a
  // customer's own address can't influence what the message is
  // interpreted as. Null for manually-typed test input (the "Run agent"
  // form has no separate sender field), where pipelines fall back to
  // extractEmailDeterministically/LLM extraction on `input` instead.
  senderEmail: string | null;
  mcpClient: Client;
  provider: AIProvider;
  allowedTools: Set<string>;
}

/**
 * A pipeline is deterministic control flow (plain code) that calls the LLM
 * only for narrow, atomic sub-tasks (extraction, composition) — never to
 * decide which tool to call or in what order. See docs/production-notes.md
 * "Neuro-symbolic harness" for why: every tool-call-format failure found
 * this project happened in the free-form LOOP mode, where the model had to
 * decide *and* format a tool call in one open-ended generation.
 */
export type Pipeline = (context: PipelineContext) => Promise<RunResult>;
