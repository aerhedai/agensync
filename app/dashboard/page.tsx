import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as dashboardService from "@/lib/dashboard/dashboard-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

// Always show live counts; this must never be a stale build-time snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const organisation = await getCurrentOrganisation();
  const counts = await dashboardService.getDashboardCounts(organisation.id);

  const stats: { label: string; value: number; href?: string }[] = [
    { label: "Agents", value: counts.agents, href: "/agents" },
    { label: "Active runs", value: counts.running },
    { label: "Completed runs", value: counts.completed },
    { label: "Failed runs", value: counts.failed },
    {
      label: "Pending approvals",
      value: counts.waitingForApproval,
      href: "/approvals",
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link
          href="/agents"
          className="text-sm font-medium text-primary hover:underline"
        >
          View agents →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
    </div>
  );
}
