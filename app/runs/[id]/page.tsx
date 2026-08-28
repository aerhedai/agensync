import Link from "next/link";
import { notFound } from "next/navigation";

import { approveRunAction, rejectRunAction } from "@/app/runs/[id]/actions";
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunStepType } from "@/lib/generated/prisma/client";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as runService from "@/lib/runs/run-service";

export const dynamic = "force-dynamic";

const STEP_LABELS: Record<RunStepType, string> = {
  INPUT_RECEIVED: "Input received",
  AGENT_DECISION: "Agent decision",
  TOOL_CALL: "Tool call",
  APPROVAL_REQUESTED: "Approval requested",
  APPROVAL_GRANTED: "Approval granted",
  RUN_COMPLETED: "Run completed",
  RUN_FAILED: "Run failed",
  RUN_CANCELLED: "Run cancelled",
};

function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null,
): string | null {
  if (!startedAt || !completedAt) return null;
  const seconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
  return `${seconds.toFixed(1)}s`;
}

export default async function RunDetailPage({
  params,
}: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const organisation = await getCurrentOrganisation();
  const run = await runService.getRun(organisation.id, id);

  if (!run) {
    notFound();
  }

  const duration = formatDuration(run.startedAt, run.completedAt);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Run #{run.id.slice(-8)}</h1>
          <RunStatusBadge status={run.status} />
        </div>
        <Link
          href={`/agents/${run.agentId}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {run.agent.name}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Input
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{run.input}</p>
        </CardContent>
      </Card>

      {run.status === "WAITING_FOR_APPROVAL" && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-warning">
              Approval needed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <form action={approveRunAction.bind(null, run.id)}>
              <Button type="submit">Approve</Button>
            </form>
            <form action={rejectRunAction.bind(null, run.id)}>
              <Button type="submit" variant="outline">
                Reject
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Steps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {run.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3 text-sm">
                <span className="text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {step.stepType === "TOOL_CALL" && step.toolCall
                      ? step.toolCall.toolName
                      : STEP_LABELS[step.stepType]}
                  </span>
                  {step.toolCall ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {step.toolCall.status === "SUCCESS"
                        ? `Result: ${JSON.stringify(step.toolCall.output)}`
                        : `Error: ${step.toolCall.error}`}
                    </span>
                  ) : (
                    step.detail && (
                      <span className="text-muted-foreground">
                        {step.detail}
                      </span>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {duration && (
        <p className="text-sm text-muted-foreground">
          Completed in: {duration}
        </p>
      )}
    </div>
  );
}
