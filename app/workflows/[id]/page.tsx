import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowFlowDiagram } from "@/components/workflows/workflow-flow-diagram";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as runService from "@/lib/runs/run-service";
import * as workflowService from "@/lib/workflows/workflow-service";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: PageProps<"/workflows/[id]">) {
  const { id } = await params;
  const organisation = await getCurrentOrganisation();
  const workflow = await workflowService.getWorkflow(organisation.id, id);

  if (!workflow) {
    notFound();
  }

  const classifierMember = workflow.members.find(
    (m) => m.role === "CLASSIFIER",
  );
  const handlerMembers = workflow.members.filter((m) => m.role === "HANDLER");

  const runs = await runService.listRunsForAgents(
    organisation.id,
    handlerMembers.map((m) => m.agent.id),
    10,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{workflow.name}</h1>
          <AgentStatusBadge status={workflow.status} />
        </div>
        <Badge variant="outline">{workflow.trigger}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{workflow.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowFlowDiagram
            classifier={
              classifierMember
                ? {
                    id: classifierMember.agent.id,
                    name: classifierMember.agent.name,
                    description: classifierMember.agent.description,
                    status: classifierMember.agent.status,
                    toolCount: classifierMember.agent.tools.length,
                  }
                : null
            }
            handlers={handlerMembers.map((m) => ({
              id: m.agent.id,
              name: m.agent.name,
              description: m.agent.description,
              status: m.agent.status,
              toolCount: m.agent.tools.length,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center justify-between gap-3 text-sm hover:underline"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      #{run.id.slice(-8)}
                    </span>
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      {run.agent.name}
                    </span>
                    <span className="truncate px-2">{run.input}</span>
                    <RunStatusBadge status={run.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
