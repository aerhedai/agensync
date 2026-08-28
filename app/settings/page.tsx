import { disconnectGmailAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GMAIL_INBOX_LABEL } from "@/lib/integrations/gmail/client";
import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  invalid_state:
    "The connection attempt expired or was tampered with. Please try again.",
  access_denied: "Google sign-in was cancelled.",
};

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { gmail_connected: gmailConnected, gmail_error: gmailError } =
    await searchParams;
  const organisation = await getCurrentOrganisation();
  const integration = await integrationService.getGmailIntegration(
    organisation.id,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Integrations
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {typeof gmailConnected === "string" && (
            <p className="text-sm text-muted-foreground">Gmail connected.</p>
          )}
          {typeof gmailError === "string" && (
            <p className="text-sm text-destructive">
              {GMAIL_ERROR_MESSAGES[gmailError] ??
                `Couldn't connect Gmail: ${gmailError}`}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Gmail</p>
              <p className="text-sm text-muted-foreground">
                {integration
                  ? `Connected as ${integration.email}`
                  : "Not connected — agents can't be triggered from email yet."}
              </p>
            </div>
            {integration ? (
              <form action={disconnectGmailAction}>
                <Button type="submit" variant="outline">
                  Disconnect
                </Button>
              </form>
            ) : (
              <Button
                nativeButton={false}
                render={<a href="/api/integrations/gmail/connect" />}
              >
                Connect Gmail
              </Button>
            )}
          </div>

          {integration && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p>
                Agents only ever read email labelled{" "}
                <span className="font-mono text-foreground">
                  {GMAIL_INBOX_LABEL}
                </span>{" "}
                — never your whole inbox. One-time setup in Gmail:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  Create a label called{" "}
                  <span className="font-mono text-foreground">
                    {GMAIL_INBOX_LABEL}
                  </span>
                  .
                </li>
                <li>
                  Pick a dedicated address customers send inquiries to (e.g. a{" "}
                  <span className="font-mono text-foreground">+quotes</span>{" "}
                  alias on this account).
                </li>
                <li>
                  Create a Gmail filter matching that address that applies the
                  label automatically.
                </li>
              </ol>
              <p className="mt-2">
                No manual labelling per email — Gmail applies it for you from
                then on.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
