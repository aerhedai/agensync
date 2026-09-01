import { headers } from "next/headers";

import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { IntegrationsSection } from "@/components/settings/integrations-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

// OAuth error codes are mostly provider-agnostic outcomes (invalid_state is
// this app's own CSRF check; access_denied is the standard OAuth code for
// "the user cancelled the consent screen", used by both Google and Slack).
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state:
    "The connection attempt expired or was tampered with. Please try again.",
  access_denied: "Sign-in was cancelled.",
};

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { connected, error } = await searchParams;
  const organisation = await getCurrentOrganisation();
  const integrations = await integrationService.listIntegrations(
    organisation.id,
  );

  // Derived from the actual incoming request rather than a hardcoded env
  // var — correct in local dev, Preview, and Production without needing
  // to keep a base-URL config value in sync with wherever this is running.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // credentials never leaves the server — strip it before this crosses
  // into the client component, not just trust the client not to read it.
  const accountsByProvider: Record<string, { id: string; name: string }[]> = {};
  for (const integration of integrations) {
    (accountsByProvider[integration.provider] ??= []).push({
      id: integration.id,
      name: integration.name,
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Business profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            name={organisation.name}
            currency={organisation.currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationsSection
            accountsByProvider={accountsByProvider}
            connectedProvider={
              typeof connected === "string" ? connected : undefined
            }
            errorMessage={
              typeof error === "string"
                ? (() => {
                    const [provider, code = "unknown_error"] = error.split(":");
                    return (
                      OAUTH_ERROR_MESSAGES[code] ??
                      `Couldn't connect ${provider}: ${code}`
                    );
                  })()
                : undefined
            }
            baseUrl={baseUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
