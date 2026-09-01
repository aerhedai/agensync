"use client";

import { useState } from "react";

import { disconnectIntegrationAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { WebhookAccountForm } from "@/components/settings/webhook-account-form";
import { GMAIL_INBOX_LABEL } from "@/lib/integrations/gmail/client";
import { INTEGRATION_REGISTRY } from "@/lib/integrations/integration-registry";

export interface DisplayAccount {
  id: string;
  name: string;
}

// Dispatches on the registry's declared connectionMode rather than a
// per-provider if-chain — "oauth" providers all render the same generic
// "Connect" link (the whole point of generalizing the flow: a third OAuth
// provider needs no change here at all). "manual" only ever needs
// WebhookAccountForm today; not abstracted further than that since there's
// still only one real manual-entry shape to support.
function AddAccountButton({
  provider,
  label,
  connectionMode,
  baseUrl,
}: {
  provider: string;
  label: string;
  connectionMode: "oauth" | "manual";
  baseUrl: string;
}) {
  if (connectionMode === "oauth") {
    return (
      <Button
        nativeButton={false}
        render={<a href={`/api/integrations/${provider}/connect`} />}
      >
        Add {label} account
      </Button>
    );
  }
  if (provider === "webhook") {
    return <WebhookAccountForm baseUrl={baseUrl} />;
  }
  return null;
}

function ProviderSetupNotes({ provider }: { provider: string }) {
  if (provider !== "gmail") return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <p>
        Agents only ever read email labelled{" "}
        <span className="font-mono text-foreground">{GMAIL_INBOX_LABEL}</span> —
        never a connected account&rsquo;s whole inbox. One-time setup per
        account in Gmail:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>
          Create a label called{" "}
          <span className="font-mono text-foreground">{GMAIL_INBOX_LABEL}</span>
          .
        </li>
        <li>
          Pick a dedicated address customers send inquiries to (e.g. a{" "}
          <span className="font-mono text-foreground">+quotes</span> alias on
          this account).
        </li>
        <li>
          Create a Gmail filter matching that address that applies the label
          automatically.
        </li>
      </ol>
      <p className="mt-2">
        No manual labelling per email — Gmail applies it for you from then on.
      </p>
    </div>
  );
}

function ProviderBox({
  provider,
  label,
  description,
  connectionMode,
  accounts,
  baseUrl,
}: {
  provider: string;
  label: string;
  description: string;
  connectionMode: "oauth" | "manual";
  accounts: DisplayAccount[];
  baseUrl: string;
}) {
  const [expanded, setExpanded] = useState(accounts.length === 0);

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          {accounts.length} account{accounts.length === 1 ? "" : "s"}{" "}
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts connected yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <span className="font-mono">{account.name}</span>
                  <form
                    action={disconnectIntegrationAction.bind(null, account.id)}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      Disconnect
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <ProviderSetupNotes provider={provider} />

          <div>
            <AddAccountButton
              provider={provider}
              label={label}
              connectionMode={connectionMode}
              baseUrl={baseUrl}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function IntegrationsSection({
  accountsByProvider,
  connectedProvider,
  errorMessage,
  baseUrl,
}: {
  accountsByProvider: Record<string, DisplayAccount[]>;
  connectedProvider?: string;
  errorMessage?: string;
  baseUrl: string;
}) {
  const connectedLabel = INTEGRATION_REGISTRY.find(
    (entry) => entry.provider === connectedProvider,
  )?.label;

  return (
    <div className="flex flex-col gap-3">
      {connectedLabel && (
        <p className="text-sm text-muted-foreground">
          {connectedLabel} account connected.
        </p>
      )}
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      {INTEGRATION_REGISTRY.map((entry) => (
        <ProviderBox
          key={entry.provider}
          provider={entry.provider}
          label={entry.label}
          description={entry.description}
          connectionMode={entry.connectionMode}
          accounts={accountsByProvider[entry.provider] ?? []}
          baseUrl={baseUrl}
        />
      ))}
    </div>
  );
}
