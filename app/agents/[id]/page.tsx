import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as agentService from "@/lib/agents/agent-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export default async function AgentDetailPage({
  params,
}: PageProps<"/agents/[id]">) {
  const { id } = await params;
  const organisation = await getCurrentOrganisation();
  const agent = await agentService.getAgent(organisation.id, id);

  if (!agent) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{agent.name}</h1>
          <AgentStatusBadge status={agent.status} />
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/agents/${agent.id}/edit`} />}
        >
          Edit
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p>{agent.description}</p>
          <p className="text-sm text-muted-foreground">
            Model: <span className="font-mono">{agent.model}</span> · Version{" "}
            {agent.version}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{agent.instructions}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No tools configured yet.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
