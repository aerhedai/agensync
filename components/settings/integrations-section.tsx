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

// Per-provider "how do I add an account" — a real per-provider dispatch
// table (an adapter interface, a plugin registry) isn't worth building
// for exactly one provider. This is the same restraint as not inventing
// a second MCP action tool just to prove the pluggable-action-tool
// abstraction earlier — add the real second case (a webhook's own connect
// flow) when it exists, not a shape guessed at now.
function AddAccountButton({
  provider,
  baseUrl,
}: {
  provider: string;
  baseUrl: string;
}) {
  if (provider === "gmail") {
    return (
      <Button
        nativeButton={false}
        render={<a href="/api/integrations/gmail/connect" />}
      >
        Add Gmail account
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
  accounts,
  baseUrl,
}: {
  provider: string;
  label: string;
  description: string;
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
            <AddAccountButton provider={provider} baseUrl={baseUrl} />
          </div>
        </div>
      )}
    </div>
  );
}

export function IntegrationsSection({
  accountsByProvider,
  gmailConnected,
  gmailError,
  baseUrl,
}: {
  accountsByProvider: Record<string, DisplayAccount[]>;
  gmailConnected?: boolean;
  gmailError?: string;
  baseUrl: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {gmailConnected && (
        <p className="text-sm text-muted-foreground">
          Gmail account connected.
        </p>
      )}
      {gmailError && <p className="text-sm text-destructive">{gmailError}</p>}

      {INTEGRATION_REGISTRY.map((entry) => (
        <ProviderBox
          key={entry.provider}
          provider={entry.provider}
          label={entry.label}
          description={entry.description}
          accounts={accountsByProvider[entry.provider] ?? []}
          baseUrl={baseUrl}
        />
      ))}
    </div>
  );
}
