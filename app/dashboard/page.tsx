import Link from "next/link";

import { checkInboxAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as dashboardService from "@/lib/dashboard/dashboard-service";
import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

const EMAIL_PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
};

// Always show live counts; this must never be a stale build-time snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const {
    inbox_processed: inboxProcessed,
    inbox_skipped: inboxSkipped,
    inbox_error: inboxError,
  } = await searchParams;
  const organisation = await getCurrentOrganisation();
  const [counts, emailIntegrations, totalTokens] = await Promise.all([
    dashboardService.getDashboardCounts(organisation.id),
    integrationService.getConnectedEmailIntegrations(organisation.id),
    dashboardService.getTotalTokenUsage(organisation.id),
  ]);

  const stats: { label: string; value: string; href?: string }[] = [
    { label: "Agents", value: String(counts.agents), href: "/workflows" },
    { label: "Active runs", value: String(counts.running) },
    { label: "Completed runs", value: String(counts.completed) },
    { label: "Failed runs", value: String(counts.failed) },
    {
      label: "Pending approvals",
      value: String(counts.waitingForApproval),
      href: "/approvals",
    },
    {
      // Deliberately just a total here, not a breakdown — the per-run
      // detail (which agent, which category, prompt vs. completion) lives
      // at /runs, not on the dashboard.
      label: "Tokens used",
      value: totalTokens.toLocaleString(),
      href: "/runs",
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link
          href="/workflows"
          className="text-sm font-medium text-primary hover:underline"
        >
          View workflows →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => {
          const card = (
            <Card
              className={
                stat.href
                  ? "transition-colors hover:border-primary/40"
                  : undefined
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          );

          return stat.href ? (
            <Link key={stat.label} href={stat.href}>
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
      </div>

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
                : `Routed ${inboxProcessed} new email${inboxProcessed === "1" ? "" : "s"} to an agent.`}
              {typeof inboxSkipped === "string" &&
                inboxSkipped !== "0" &&
                ` ${inboxSkipped} left unread — no agent's scope clearly matched.`}
            </p>
          )}
          {typeof inboxError === "string" && (
            <p className="text-sm text-destructive">{inboxError}</p>
          )}
          {emailIntegrations.length > 0 ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Connected:{" "}
                {emailIntegrations
                  .map(
                    (integration) =>
                      `${EMAIL_PROVIDER_LABELS[integration.provider] ?? integration.provider} (${integration.name})`,
                  )
                  .join(", ")}{" "}
                — only reads mail routed into the Agensync label/folder, and
                routes each email to whichever agent&apos;s description best
                matches it (see Settings).
              </p>
              <form action={checkInboxAction}>
                <Button type="submit" variant="outline">
                  Check inbox
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not connected.{" "}
              <Link
                href="/settings/integrations"
                className="text-primary hover:underline"
              >
                Connect Gmail or Outlook in Settings
              </Link>{" "}
              to trigger agents from real email.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
