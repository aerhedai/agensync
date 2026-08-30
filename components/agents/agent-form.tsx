"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AgentFormState } from "@/app/agents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Agent } from "@/lib/generated/prisma/client";
import { TOOL_REGISTRY } from "@/lib/mcp/tool-registry";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

type AgentFormValues = Pick<
  Agent,
  | "name"
  | "description"
  | "instructions"
  | "model"
  | "keywords"
  | "replySubjectTemplate"
> & {
  toolNames?: string[];
};

export function AgentForm({
  action,
  agent,
  submitLabel,
}: {
  action: (
    prevState: AgentFormState,
    formData: FormData,
  ) => Promise<AgentFormState>;
  agent?: AgentFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<AgentFormState, FormData>(
    action,
    {},
  );
  const grantedTools = new Set(agent?.toolNames ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={agent?.name} required />
        {state.fieldErrors?.name && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={agent?.description}
          required
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="instructions">Instructions</Label>
        <Textarea
          id="instructions"
          name="instructions"
          rows={6}
          defaultValue={agent?.instructions}
          required
        />
        <p className="text-xs text-muted-foreground">
          For agents running a fixed pipeline, this is appended as extra
          guidance after the pipeline&rsquo;s own tone and safety rules — it can
          add to them, not override them.
        </p>
        {state.fieldErrors?.instructions && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.instructions[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          name="model"
          defaultValue={agent?.model}
          required
          placeholder="e.g. qwen2.5:14b"
        />
        {state.fieldErrors?.model && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.model[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="keywords">Routing keywords</Label>
        <Input
          id="keywords"
          name="keywords"
          defaultValue={agent?.keywords?.join(", ")}
          placeholder="e.g. quote, price, how much"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated. If an inbound message contains one of these words and
          no other agent&rsquo;s keywords also match, routing skips the LLM
          classifier entirely. Leave blank to always ask the classifier.
        </p>
        {state.fieldErrors?.keywords && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.keywords[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="replySubjectTemplate">Reply subject line</Label>
        <Input
          id="replySubjectTemplate"
          name="replySubjectTemplate"
          defaultValue={agent?.replySubjectTemplate ?? ""}
          placeholder="Leave blank to use the default for this agent's job"
        />
        {state.fieldErrors?.replySubjectTemplate && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.replySubjectTemplate[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tools</Label>
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {TOOL_REGISTRY.map((tool) => (
            <label
              key={tool.name}
              className="flex items-start gap-2 text-sm"
              htmlFor={`tool-${tool.name}`}
            >
              <input
                type="checkbox"
                id={`tool-${tool.name}`}
                name="toolNames"
                value={tool.name}
                defaultChecked={grantedTools.has(tool.name)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span className="flex flex-col">
                <span className="font-medium">{tool.label}</span>
                <span className="text-muted-foreground">
                  {tool.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A tool call this agent isn&rsquo;t granted here is refused at runtime,
          even if the model asks for it.
        </p>
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
