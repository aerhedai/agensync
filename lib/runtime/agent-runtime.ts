import { getAIProvider } from "@/lib/ai/get-provider";
import type {
  AIMessage,
  AIProvider,
  AIToolDefinition,
} from "@/lib/ai/provider";
import type { Agent } from "@/lib/generated/prisma/client";
import { connectMcpClient } from "@/lib/mcp/client";
import * as runRepository from "@/lib/runs/run-repository";

// Configurable safeguard against infinite agent loops (CLAUDE.md #10).
const MAX_AGENT_STEPS = 20;

export interface RunResult {
  runId: string;
  status: "COMPLETED" | "FAILED";
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

  const mcpClient = await connectMcpClient();

  try {
    const { tools: mcpTools } = await mcpClient.listTools();
    const tools: AIToolDefinition[] = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      parameters: (tool.inputSchema ?? {
        type: "object",
        properties: {},
      }) as Record<string, unknown>,
    }));
    const messages: AIMessage[] = [
      { role: "system", content: agent.instructions },
      { role: "user", content: input },
    ];

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const response = await provider.generateResponse({
        model: agent.model,
        messages,
        tools,
      });
      await runRepository.addRunStep(
        run.id,
        "AGENT_DECISION",
        response.content || undefined,
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        await runRepository.markRunStatus(run.id, "COMPLETED", {
          completedAt: new Date(),
        });
        await runRepository.addRunStep(
          run.id,
          "RUN_COMPLETED",
          response.content,
        );
        return { runId: run.id, status: "COMPLETED" };
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
          run.id,
          call.name,
          call.arguments,
          result.structuredContent as Record<string, unknown> | undefined,
          isError ? "FAILED" : "SUCCESS",
          isError ? firstErrorText(result.content) : undefined,
        );
        await runRepository.addRunStep(
          run.id,
          "TOOL_CALL",
          call.name,
          toolCall.id,
        );

        messages.push({
          role: "tool",
          content: JSON.stringify(result.structuredContent ?? {}),
          toolCallId: call.id,
        });
      }
    }

    await runRepository.markRunStatus(run.id, "FAILED", {
      completedAt: new Date(),
    });
    await runRepository.addRunStep(
      run.id,
      "RUN_FAILED",
      `Exceeded the maximum of ${MAX_AGENT_STEPS} steps without completing.`,
    );
    return { runId: run.id, status: "FAILED" };
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
