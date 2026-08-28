import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { getAIProvider } from "@/lib/ai/get-provider";
import type {
  AIMessage,
  AIProvider,
  AIToolDefinition,
} from "@/lib/ai/provider";
import * as approvalRepository from "@/lib/approvals/approval-repository";
import { prisma } from "@/lib/db/prisma";
import type { Agent, Prisma } from "@/lib/generated/prisma/client";
import { connectMcpClient } from "@/lib/mcp/client";
import { evaluatePolicy } from "@/lib/policies/policy-engine";
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

async function loadTools(mcpClient: Client): Promise<AIToolDefinition[]> {
  const { tools: mcpTools } = await mcpClient.listTools();
  return mcpTools.map((tool) => ({
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
      const result = await mcpClient.callTool({
        name: call.name,
        arguments: call.arguments,
      });
      const isError = result.isError === true;

      const toolCall = await runRepository.createToolCall(
        runId,
        call.name,
        call.arguments,
        result.structuredContent as Record<string, unknown> | undefined,
        isError ? "FAILED" : "SUCCESS",
        isError ? firstErrorText(result.content) : undefined,
      );
      await runRepository.addRunStep(
        runId,
        "TOOL_CALL",
        call.name,
        toolCall.id,
      );

      messages.push({
        role: "tool",
        content: JSON.stringify(result.structuredContent ?? {}),
        toolCallId: call.id,
      });

      if (!isError) {
        const policy = evaluatePolicy({
          toolName: call.name,
          toolOutput:
            (result.structuredContent as Record<string, unknown>) ?? {},
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
    const tools = await loadTools(mcpClient);
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
    const tools = await loadTools(mcpClient);
    const messages = ((
      await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    ).messages ?? []) as unknown as AIMessage[];

    return await runLoop({
      runId,
      organisationId,
      agentModel: run.agent.model,
      messages,
      tools,
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
