import { AIProviderForm } from "@/components/settings/ai-provider-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrganisationAIConnection } from "@/lib/ai/organisation-ai-provider";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

export default async function AIProviderSettingsPage() {
  const organisation = await getCurrentOrganisation();
  const connection = await getOrganisationAIConnection(organisation.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">AI Provider</h2>
        <p className="text-sm text-muted-foreground">
          Every agent run in this organisation calls the model here — nothing
          runs until one is connected. This is scoped to your organisation only:
          no other business on this platform can reach it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ollama
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AIProviderForm connection={connection} />
        </CardContent>
      </Card>
    </div>
  );
}
