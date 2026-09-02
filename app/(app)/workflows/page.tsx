import Link from "next/link";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowFlowDiagram } from "@/components/workflows/workflow-flow-diagram";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as workflowService from "@/lib/workflows/workflow-service";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const organisation = await getCurrentOrganisation();
  const workflows = await workflowService.listWorkflows(organisation.id);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/workflows/new"
            className="text-sm font-medium text-primary hover:underline"
          >
            Create workflow
          </Link>
          <Link
            href="/agents"
            className="text-sm font-medium text-primary hover:underline"
          >
            All agents →
          </Link>
        </div>
      </div>

      {workflows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflows yet — a workflow ties a classifier agent to the handler
          agents it can route to.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {workflows.map((workflow) => {
            const classifierMember = workflow.members.find(
              (m) => m.role === "CLASSIFIER",
            );
            const handlerMembers = workflow.members.filter(
              (m) => m.role === "HANDLER",
            );

            return (
              <Card key={workflow.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/workflows/${workflow.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <CardTitle className="text-base">
                        {workflow.name}
                      </CardTitle>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          workflow.source === "TEMPLATE"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {workflow.source === "TEMPLATE" ? "Template" : "Custom"}
                      </Badge>
                      <Badge variant="outline">{workflow.trigger}</Badge>
                      <AgentStatusBadge status={workflow.status} />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {workflow.description}
                  </p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
