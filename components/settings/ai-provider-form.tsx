"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  disconnectAIProviderAction,
  saveOllamaProviderAction,
  type OllamaProviderFormState,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function DisconnectButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}

export function AIProviderForm({
  connection,
}: {
  connection: { baseUrl: string; connectedAt: Date } | null;
}) {
  const [state, formAction] = useActionState<OllamaProviderFormState, FormData>(
    saveOllamaProviderAction,
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      {connection && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-secondary/40 p-3 text-sm">
          <div>
            <p className="font-medium">Connected</p>
            <p className="text-muted-foreground">
              {connection.baseUrl} — updated{" "}
              {connection.connectedAt.toLocaleDateString("en-GB")}
            </p>
          </div>
          <form action={disconnectAIProviderAction}>
            <DisconnectButton />
          </form>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state.saved && <p className="text-sm text-success">Saved.</p>}
        <div className="flex flex-col gap-2">
          <Label htmlFor="baseUrl">Base URL</Label>
          <Input
            key={connection?.baseUrl}
            id="baseUrl"
            name="baseUrl"
            type="url"
            placeholder="https://your-host:11434"
            defaultValue={connection?.baseUrl ?? ""}
            required
          />
          <p className="text-xs text-muted-foreground">
            Where this organisation&rsquo;s Ollama instance is reachable — plain{" "}
            <span className="font-mono">http://localhost:11434</span> for local
            dev, or the auth proxy URL for a hosted deployment.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="proxySecret">Proxy secret (optional)</Label>
          <Input
            id="proxySecret"
            name="proxySecret"
            type="password"
            placeholder={connection ? "Unchanged — leave blank to keep it" : ""}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Only needed if the base URL points at an auth-gated proxy in front
            of Ollama, not plain local Ollama.
          </p>
        </div>
        <SaveButton />
      </form>
    </div>
  );
}
