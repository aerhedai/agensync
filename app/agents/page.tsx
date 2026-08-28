import Link from "next/link";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import * as agentService from "@/lib/agents/agent-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

// Always show live data; this must never be a stale build-time snapshot.
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const organisation = await getCurrentOrganisation();
  const agents = await agentService.listAgents(organisation.id);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Agents</h1>
        <Button nativeButton={false} render={<Link href="/agents/new" />}>
          Create agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No agents yet. Create one to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{agent.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {agent.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {agent._count.runs} run
                      {agent._count.runs === 1 ? "" : "s"}
                    </span>
                    <AgentStatusBadge status={agent.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
