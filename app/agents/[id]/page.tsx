import Link from "next/link";
import { notFound } from "next/navigation";

import { checkInboxAction, runAgentAction } from "@/app/agents/[id]/actions";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { RunAgentForm } from "@/components/agents/run-agent-form";
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as agentService from "@/lib/agents/agent-service";
import { GMAIL_INBOX_LABEL } from "@/lib/integrations/gmail/client";
import * as integrationService from "@/lib/integrations/integration-service";
import { connectMcpClient } from "@/lib/mcp/client";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as runService from "@/lib/runs/run-service";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({
  params,
  searchParams,
}: PageProps<"/agents/[id]">) {
  const { id } = await params;
  const { inbox_processed: inboxProcessed, inbox_error: inboxError } =
    await searchParams;
  const organisation = await getCurrentOrganisation();
  const agent = await agentService.getAgent(organisation.id, id);

  if (!agent) {
    notFound();
  }

  const [runs, mcpClient, gmailIntegration] = await Promise.all([
    runService.listRunsForAgent(organisation.id, agent.id),
    connectMcpClient(organisation.id),
    integrationService.getGmailIntegration(organisation.id),
  ]);
  const { tools } = await mcpClient.listTools();
  await mcpClient.close();

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
            {tools.map((tool) => tool.name).join(", ")} — available to every
            agent for now; per-agent tool restriction isn&apos;t built yet.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Run agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RunAgentForm action={runAgentAction.bind(null, agent.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Email inbox
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {typeof inboxProcessed === "string" && (
            <p className="text-sm text-muted-foreground">
              {inboxProcessed === "0"
                ? "No new emails."
                : `Processed ${inboxProcessed} new email${inboxProcessed === "1" ? "" : "s"}.`}
            </p>
          )}
          {typeof inboxError === "string" && (
            <p className="text-sm text-destructive">{inboxError}</p>
          )}
          {gmailIntegration ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Connected as{" "}
                <span className="font-mono">{gmailIntegration.email}</span> —
                only reads mail labelled{" "}
                <span className="font-mono">{GMAIL_INBOX_LABEL}</span> (see
                Settings).
              </p>
              <form action={checkInboxAction.bind(null, agent.id)}>
                <Button type="submit" variant="outline">
                  Check inbox
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not connected.{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Connect Gmail in Settings
              </Link>{" "}
              to trigger this agent from real email.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Runs
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
                    className="flex items-center justify-between text-sm hover:underline"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      #{run.id.slice(-8)}
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
