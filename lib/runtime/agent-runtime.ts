import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { getAIProvider } from "@/lib/ai/get-provider";
import type {
  AIMessage,
  AIProvider,
  AIToolCallRequest,
  AIToolDefinition,
} from "@/lib/ai/provider";
import * as agentToolRepository from "@/lib/agents/agent-tool-repository";
import * as approvalRepository from "@/lib/approvals/approval-repository";
import { prisma } from "@/lib/db/prisma";
import type { Agent, Prisma } from "@/lib/generated/prisma/client";
import { connectMcpClient } from "@/lib/mcp/client";
import {
  evaluatePolicy,
  requiresApprovalBeforeExecution,
} from "@/lib/policies/policy-engine";
import * as runRepository from "@/lib/runs/run-repository";

// Configurable safeguard against infinite agent loops (CLAUDE.md #10).
const MAX_AGENT_STEPS = 20;

export interface RunResult {
  runId: string;
  status: "COMPLETED" | "FAILED" | "WAITING_FOR_APPROVAL" | "CANCELLED";
}

function firstErrorText(content: unknown): string {
  if (!Array.isArray(content)) return "Tool call failed.";
  const textBlock = content.find(
    (block): block is { type: "text"; text: string } =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text",
  );
  return textBlock?.text ?? "Tool call failed.";
}

/**
 * Executes one tool call, records it (ToolCall + TOOL_CALL step), and
 * appends its result to the conversation. Shared by the main loop (for
 * tools that don't need prior approval) and resumeRun (for executing a
 * previously-held-back call after it's approved) so the two can't diverge.
 */
async function executeToolCall(
  runId: string,
  mcpClient: Client,
  call: AIToolCallRequest,
  messages: AIMessage[],
): Promise<{
  isError: boolean;
  structuredContent: Record<string, unknown> | undefined;
}> {
  const result = await mcpClient.callTool({
    name: call.name,
    arguments: call.arguments,
  });
  const isError = result.isError === true;
  const structuredContent = result.structuredContent as
    Record<string, unknown> | undefined;

  const toolCall = await runRepository.createToolCall(
    runId,
    call.name,
    call.arguments,
    structuredContent,
    isError ? "FAILED" : "SUCCESS",
    isError ? firstErrorText(result.content) : undefined,
  );
  await runRepository.addRunStep(runId, "TOOL_CALL", call.name, toolCall.id);

  messages.push({
    role: "tool",
    content: JSON.stringify(structuredContent ?? {}),
    toolCallId: call.id,
  });

  return { isError, structuredContent };
}

/**
 * Records a tool call the agent isn't permitted to use as a failed call —
 * without ever reaching the MCP server — and lets the model see the error
 * and react (CLAUDE.md #9 step 3: "check the agent has access to the
 * tool"). Kept distinct from executeToolCall: this path never touches
 * mcpClient at all, since the call is refused before execution is even
 * attempted.
 */
async function recordDisallowedToolCall(
  runId: string,
  call: AIToolCallRequest,
  messages: AIMessage[],
): Promise<void> {
  const error = `This agent does not have access to the "${call.name}" tool.`;
  const toolCall = await runRepository.createToolCall(
    runId,
    call.name,
    call.arguments,
    undefined,
    "FAILED",
    error,
  );
  await runRepository.addRunStep(runId, "TOOL_CALL", call.name, toolCall.id);

  messages.push({
    role: "tool",
    content: JSON.stringify({ error }),
    toolCallId: call.id,
  });
}

/**
 * Detects when the model wrote its intended tool call as plain text (e.g.
 * `{"name": "send_email", "arguments": {...}}` in `content`) instead of
 * using the provider's actual tool-calling mechanism — observed live: two
 * runs marked COMPLETED with an email that was never really sent, because
 * an empty `toolCalls` array reads as "no more action needed." Narrow and
 * precise on purpose (valid JSON naming one of *this agent's own* tools)
 * so it doesn't false-positive on a normal reply that happens to start
 * with "{".
 */
function looksLikeAbortedToolCall(
  content: string,
  tools: AIToolDefinition[],
): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;

  const { name, arguments: args } = parsed as Record<string, unknown>;
  return (
    typeof name === "string" &&
    tools.some((tool) => tool.name === name) &&
    typeof args === "object" &&
    args !== null
  );
}

async function loadTools(
  mcpClient: Client,
  allowedTools: Set<string>,
): Promise<AIToolDefinition[]> {
  const { tools: mcpTools } = await mcpClient.listTools();
  return mcpTools
    .filter((tool) => allowedTools.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      parameters: (tool.inputSchema ?? {
        type: "object",
        properties: {},
      }) as Record<string, unknown>,
    }));
}

interface LoopContext {
  runId: string;
  organisationId: string;
  agentModel: string;
  messages: AIMessage[];
  tools: AIToolDefinition[];
  allowedTools: Set<string>;
  provider: AIProvider;
  mcpClient: Client;
}

/**
 * The core loop: input -> LLM -> tool call -> policy check -> result -> LLM
 * -> ... -> complete (CLAUDE.md #10). Shared by runAgent (fresh start) and
 * resumeRun (continuing from a persisted message snapshot after approval),
 * so pausing/resuming can't drift into two different implementations.
 */
async function runLoop(context: LoopContext): Promise<RunResult> {
  const {
    runId,
    organisationId,
    agentModel,
    messages,
    tools,
    allowedTools,
    provider,
    mcpClient,
  } = context;

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const response = await provider.generateResponse({
      model: agentModel,
      messages,
      tools,
    });
    await runRepository.addRunStep(
      runId,
      "AGENT_DECISION",
      response.content || undefined,
    );

    if (!response.toolCalls || response.toolCalls.length === 0) {
      if (looksLikeAbortedToolCall(response.content, tools)) {
        // Never claim success when the intended action never actually
        // ran — this is a visible failure a human can retry, not a
        // silent no-op dressed up as COMPLETED.
        await runRepository.markRunStatus(runId, "FAILED", {
          completedAt: new Date(),
        });
        await runRepository.addRunStep(
          runId,
          "RUN_FAILED",
          "The model wrote its intended tool call as plain text instead of a real tool call, so nothing was actually executed. Try running this input again.",
        );
        return { runId, status: "FAILED" };
      }

      await runRepository.markRunStatus(runId, "COMPLETED", {
        completedAt: new Date(),
      });
      await runRepository.addRunStep(runId, "RUN_COMPLETED", response.content);
      return { runId, status: "COMPLETED" };
    }

    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      if (!allowedTools.has(call.name)) {
        await recordDisallowedToolCall(runId, call, messages);
        continue;
      }

      if (requiresApprovalBeforeExecution(call.name)) {
        // Gated *before* execution — this tool mutates external,
        // customer-visible state, and approving after the fact can't
        // un-send an email. The assistant message above already recorded
        // this call's proposed arguments in `messages`, so the resume path
        // has everything it needs to execute exactly this call once
        // approved (see resumeRun).
        await runRepository.saveMessages(
          runId,
          messages as unknown as Prisma.InputJsonValue,
        );
        await runRepository.markRunStatus(runId, "WAITING_FOR_APPROVAL");
        const reason = `${call.name} requires human approval before it runs.`;
        await runRepository.addRunStep(runId, "APPROVAL_REQUESTED", reason);
        await approvalRepository.createApproval(
          organisationId,
          runId,
          call.name,
          reason,
          call.arguments as Prisma.InputJsonValue,
          call.id,
        );
        return { runId, status: "WAITING_FOR_APPROVAL" };
      }

      const { isError, structuredContent } = await executeToolCall(
        runId,
        mcpClient,
        call,
        messages,
      );

      if (!isError) {
        const policy = evaluatePolicy({
          toolName: call.name,
          toolOutput: structuredContent ?? {},
        });

        if (policy.decision === "REQUIRE_APPROVAL") {
          await runRepository.saveMessages(
            runId,
            messages as unknown as Prisma.InputJsonValue,
          );
          await runRepository.markRunStatus(runId, "WAITING_FOR_APPROVAL");
          await runRepository.addRunStep(
            runId,
            "APPROVAL_REQUESTED",
            policy.reason,
          );
          await approvalRepository.createApproval(
            organisationId,
            runId,
            call.name,
            policy.reason,
          );
          return { runId, status: "WAITING_FOR_APPROVAL" };
        }

        if (policy.decision === "DENY") {
          await runRepository.markRunStatus(runId, "FAILED", {
            completedAt: new Date(),
          });
          await runRepository.addRunStep(
            runId,
            "RUN_FAILED",
            `Denied by policy: ${policy.reason}`,
          );
          return { runId, status: "FAILED" };
        }
      }
    }
  }

  await runRepository.markRunStatus(runId, "FAILED", {
    completedAt: new Date(),
  });
  await runRepository.addRunStep(
    runId,
    "RUN_FAILED",
    `Exceeded the maximum of ${MAX_AGENT_STEPS} steps without completing.`,
  );
  return { runId, status: "FAILED" };
}

export async function runAgent(
  agent: Agent,
  input: string,
  provider: AIProvider = getAIProvider(),
): Promise<RunResult> {
  const run = await runRepository.createRun(
    agent.organisationId,
    agent.id,
    input,
  );
  await runRepository.markRunStatus(run.id, "RUNNING", {
    startedAt: new Date(),
  });
  await runRepository.addRunStep(run.id, "INPUT_RECEIVED", input);

  const mcpClient = await connectMcpClient(agent.organisationId);

  try {
    const allowedTools = new Set(
      await agentToolRepository.findToolNamesForAgent(agent.id),
    );
    const tools = await loadTools(mcpClient, allowedTools);
    const messages: AIMessage[] = [
      { role: "system", content: agent.instructions },
      { role: "user", content: input },
    ];

    return await runLoop({
      runId: run.id,
      organisationId: agent.organisationId,
      agentModel: agent.model,
      messages,
      tools,
      allowedTools,
      provider,
      mcpClient,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    await runRepository.markRunStatus(run.id, "FAILED", {
      completedAt: new Date(),
    });
    await runRepository.addRunStep(run.id, "RUN_FAILED", message);
    return { runId: run.id, status: "FAILED" };
  } finally {
    await mcpClient.close();
  }
}

/**
 * Resumes a run that's WAITING_FOR_APPROVAL after a human decision.
 * Rejecting cancels the run outright; approving continues the loop from
 * the exact conversation state saved when it paused. The step counter
 * resets on resume — a resumed run gets its own fresh MAX_AGENT_STEPS
 * budget, which is a deliberate V1 simplification.
 */
export async function resumeRun(
  runId: string,
  organisationId: string,
  decision: "APPROVED" | "REJECTED",
  approverId: string,
  provider: AIProvider = getAIProvider(),
): Promise<RunResult> {
  const run = await runRepository.findRunById(organisationId, runId);
  if (!run || run.status !== "WAITING_FOR_APPROVAL") {
    throw new Error("This run is not waiting for approval.");
  }

  const approval = await approvalRepository.findPendingApprovalForRun(runId);

  if (decision === "REJECTED") {
    if (approval) {
      await approvalRepository.decideApproval(
        approval.id,
        "REJECTED",
        approverId,
      );
    }
    await runRepository.markRunStatus(runId, "CANCELLED", {
      completedAt: new Date(),
    });
    await runRepository.addRunStep(
      runId,
      "RUN_CANCELLED",
      "Rejected by approver.",
    );
    return { runId, status: "CANCELLED" };
  }

  if (approval) {
    await approvalRepository.decideApproval(
      approval.id,
      "APPROVED",
      approverId,
    );
  }
  await runRepository.addRunStep(
    runId,
    "APPROVAL_GRANTED",
    "Approved — resuming.",
  );
  await runRepository.markRunStatus(runId, "RUNNING");

  const mcpClient = await connectMcpClient(organisationId);

  try {
    const allowedTools = new Set(
      await agentToolRepository.findToolNamesForAgent(run.agent.id),
    );
    const tools = await loadTools(mcpClient, allowedTools);
    const messages = ((
      await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    ).messages ?? []) as unknown as AIMessage[];

    // Now that a human has approved it, actually run the call that was
    // held back before it could execute (see requiresApprovalBeforeExecution
    // in the main loop). A tool-level failure here is handled the same way
    // as any other tool error — recorded, not fatal — so the agent's next
    // turn can react to it; only an explicit DENY stops the run outright.
    if (approval?.proposedInput && approval.proposedToolCallId) {
      const { isError, structuredContent } = await executeToolCall(
        runId,
        mcpClient,
        {
          id: approval.proposedToolCallId,
          name: approval.requestedAction,
          arguments: approval.proposedInput as Record<string, unknown>,
        },
        messages,
      );

      if (!isError) {
        const policy = evaluatePolicy({
          toolName: approval.requestedAction,
          toolOutput: structuredContent ?? {},
        });
        if (policy.decision === "DENY") {
          await runRepository.markRunStatus(runId, "FAILED", {
            completedAt: new Date(),
          });
          await runRepository.addRunStep(
            runId,
            "RUN_FAILED",
            `Denied by policy: ${policy.reason}`,
          );
          return { runId, status: "FAILED" };
        }
      }
    }

    return await runLoop({
      runId,
      organisationId,
      agentModel: run.agent.model,
      messages,
      tools,
      allowedTools,
      provider,
      mcpClient,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    await runRepository.markRunStatus(runId, "FAILED", {
      completedAt: new Date(),
    });
    await runRepository.addRunStep(runId, "RUN_FAILED", message);
    return { runId, status: "FAILED" };
  } finally {
    await mcpClient.close();
  }
}
