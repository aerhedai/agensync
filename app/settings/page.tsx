import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { IntegrationsSection } from "@/components/settings/integrations-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const integrations = await integrationService.listIntegrations(
    organisation.id,
  );

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
            gmailConnected={typeof gmailConnected === "string"}
            gmailError={
              typeof gmailError === "string"
                ? (GMAIL_ERROR_MESSAGES[gmailError] ??
                  `Couldn't connect Gmail: ${gmailError}`)
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
