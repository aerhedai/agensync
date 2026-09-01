import Link from "next/link";

import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as runService from "@/lib/runs/run-service";

export const dynamic = "force-dynamic";

function formatTokens(promptTokens: number, completionTokens: number): string {
  const total = promptTokens + completionTokens;
  if (total === 0) return "—";
  return `${total.toLocaleString()} (${promptTokens.toLocaleString()} + ${completionTokens.toLocaleString()})`;
}

export default async function RunsPage({ searchParams }: PageProps<"/runs">) {
  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? parseInt(pageParam, 10) || 1 : 1;

  const organisation = await getCurrentOrganisation();
  const { runs, totalCount, totalPages } =
    await runService.listRunsForOrganisation(organisation.id, page);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Runs</h1>
          <p className="text-sm text-muted-foreground">
            Every run across every agent in this organisation, most recent first
            — {totalCount.toLocaleString()} total.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            All runs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Run</th>
                    <th className="px-4 py-2 font-medium">Agent</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Input</th>
                    <th className="px-4 py-2 font-medium">
                      Tokens (prompt + completion)
                    </th>
                    <th className="px-4 py-2 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/runs/${run.id}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          #{run.id.slice(-8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/agents/${run.agentId}`}
                          className="hover:underline"
                        >
                          {run.agentName}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td className="max-w-xs truncate px-4 py-2 text-muted-foreground">
                        {run.input}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs tabular-nums">
                        {formatTokens(run.promptTokens, run.completionTokens)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {run.createdAt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Link href={`/runs?page=${Math.max(1, page - 1)}`}>
              <Button type="button" variant="outline" disabled={page <= 1}>
                Previous
              </Button>
            </Link>
            <Link href={`/runs?page=${Math.min(totalPages, page + 1)}`}>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
