import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type { AIProvider } from "@/lib/ai/provider";
import type { Agent } from "@/lib/generated/prisma/client";
import type { RunResult } from "@/lib/runtime/agent-runtime";

export interface PipelineContext {
  runId: string;
  organisationId: string;
  agent: Agent;
  input: string;
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
