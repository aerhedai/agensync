import Link from "next/link";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { Card } from "@/components/ui/card";
import type { AgentStatus } from "@/lib/generated/prisma/client";

export interface FlowAgent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  toolCount: number;
}

function AgentNode({
  agent,
  kind,
}: {
  agent: FlowAgent;
  kind: "classifier" | "handler";
}) {
  return (
    <Link href={`/agents/${agent.id}`} className="block w-56 shrink-0">
      <Card className="gap-2 px-4 transition-colors hover:border-primary/40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
            {kind === "classifier" ? "Classifier" : "Handler"}
          </span>
          <AgentStatusBadge status={agent.status} />
        </div>
        <p className="text-sm font-medium">{agent.name}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {agent.description}
        </p>
        <p className="text-xs text-muted-foreground">
          {agent.toolCount} tool{agent.toolCount === 1 ? "" : "s"}
        </p>
      </Card>
    </Link>
  );
}

/**
 * A deliberately simple flow chart (plain divs + borders, no diagramming
 * library — CLAUDE.md #4 says not to build a complex visual editor): one
 * classifier fanning out to its handler agents, each node linking through
 * to that agent's own detail page.
 */
export function WorkflowFlowDiagram({
  classifier,
  handlers,
}: {
  classifier: FlowAgent | null;
  handlers: FlowAgent[];
}) {
  if (!classifier) {
    return (
      <p className="text-sm text-muted-foreground">
        This workflow has no classifier agent assigned.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center overflow-x-auto py-2">
      <AgentNode agent={classifier} kind="classifier" />

      {handlers.length > 0 && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="flex gap-6 border-t border-border pt-6">
            {handlers.map((handler) => (
              <div
                key={handler.id}
                className="-mt-6 flex flex-col items-center gap-2"
              >
                <div className="h-6 w-px bg-border" />
                <AgentNode agent={handler} kind="handler" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
