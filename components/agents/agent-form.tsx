"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  DEFAULT_STEPS_JSON,
  StepProgrammeFields,
} from "@/components/agents/step-programme-fields";
import {
  TemplatePicker,
  type TemplateOption,
} from "@/components/agents/template-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentFormState } from "@/app/(app)/agents/actions";
import type { Agent } from "@/lib/generated/prisma/client";
import { TOOL_GROUPS, TOOL_REGISTRY } from "@/lib/mcp/tool-registry";

/**
 * Creating an agent.
 *
 * Every field here is generic — a name, what it should do, which tools it
 * may use, what it must never say. Nothing on this form is specific to
 * quoting, or complaints, or invoices. The one place anything
 * business-specific appears is the template picker, which pre-fills the
 * steps and ticks the tools those steps need (CLAUDE.md §3: a vertical is
 * a template, never a primitive).
 *
 * This replaced a "Category type" radio list of five fixed process shapes,
 * one of which ("Lookup & Quote") was a hardcoded business process every
 * unrelated business had to scroll past, and each of which revealed a
 * different subset of fields. An agent is now a step programme, full stop.
 *
 * Agents created before that change still run their original pipeline —
 * see the notice rendered for them below. They aren't migrated, and
 * nothing here can turn one into another; they simply keep working.
 */

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
  | "executionMode"
  | "pipelineKey"
  | "guardrailKeywords"
  | "actionIntegrationId"
> & {
  toolNames?: string[];
};

// Anything that isn't the generic step pipeline and isn't free-form LOOP is
// one of the original fixed shapes. Editing one is still allowed — it just
// can't be re-pointed at a different fixed shape from here, because those
// are no longer offered.
function isLegacyPipeline(agent?: AgentFormValues): boolean {
  if (!agent) return false;
  return (
    agent.executionMode === "HARNESS" &&
    agent.pipelineKey !== null &&
    agent.pipelineKey !== "steps"
  );
}

export function AgentForm({
  action,
  agent,
  submitLabel,
  templates = [],
  gmailIntegrations = [],
  initialStepsConfig,
}: {
  action: (
    prevState: AgentFormState,
    formData: FormData,
  ) => Promise<AgentFormState>;
  agent?: AgentFormValues;
  submitLabel: string;
  // Built-in and this organisation's own saved starting points. Empty by
  // default so any caller not yet passing them still renders.
  templates?: TemplateOption[];
  gmailIntegrations?: { id: string; name: string }[];
  // The agent's existing step programme when editing. Raw rather than
  // typed: it round-trips through the JSON editor and is validated
  // server-side against the same schema the runtime uses.
  initialStepsConfig?: Record<string, unknown>;
}) {
  const [state, formAction] = useActionState<AgentFormState, FormData>(
    action,
    {},
  );

  const legacy = isLegacyPipeline(agent);

  const [stepsJson, setStepsJson] = useState(() =>
    initialStepsConfig && Object.keys(initialStepsConfig).length > 0
      ? JSON.stringify(initialStepsConfig, null, 2)
      : DEFAULT_STEPS_JSON,
  );
  // Controlled rather than defaultChecked, because installing a template
  // ticks the tools its steps need.
  const [toolNames, setToolNames] = useState<Set<string>>(
    () => new Set(agent?.toolNames ?? []),
  );

  function installTemplate(template: TemplateOption) {
    setStepsJson(JSON.stringify(template.steps, null, 2));
    // Added to what's already ticked rather than replacing it — someone
    // who ticked a tool before picking a template meant to keep it.
    setToolNames((current) => {
      const next = new Set(current);
      for (const tool of template.suggestedTools) next.add(tool);
      return next;
    });
  }

  function toggleTool(name: string, checked: boolean) {
    setToolNames((current) => {
      const next = new Set(current);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

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
        <textarea
          id="description"
          name="description"
          defaultValue={agent?.description}
          required
          rows={2}
          className="w-full rounded-md border border-border bg-transparent p-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          What this agent handles. The classifier routes inbound work by
          comparing messages against this, so be specific about scope.
        </p>
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="instructions">Instructions</Label>
        <textarea
          id="instructions"
          name="instructions"
          defaultValue={agent?.instructions}
          required
          rows={3}
          className="w-full rounded-md border border-border bg-transparent p-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Business-specific guidance, added on top of each step&rsquo;s own
          instructions rather than replacing them.
        </p>
        {state.fieldErrors?.instructions && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.instructions[0]}
          </p>
        )}
      </div>

      {legacy ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3">
          {/* categoryType now defaults to "steps" server-side. Without
              this, saving an edit to a legacy agent would silently
              re-point it at the step pipeline with no steps configured —
              breaking a working agent through an unrelated edit. */}
          <input
            type="hidden"
            name="categoryType"
            value={agent?.pipelineKey ?? ""}
          />
          <p className="text-sm font-medium">
            This agent runs the built-in &ldquo;{agent?.pipelineKey}&rdquo;
            process
          </p>
          <p className="text-xs text-muted-foreground">
            It was created before agents became step sequences, and keeps
            working exactly as it did. Its steps aren&rsquo;t editable here — to
            move it onto steps, create a new agent from a template and retire
            this one.
          </p>
        </div>
      ) : (
        <>
          <TemplatePicker templates={templates} onInstall={installTemplate} />
          <StepProgrammeFields value={stepsJson} onChange={setStepsJson} />
          {state.fieldErrors?.pipelineConfig && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.pipelineConfig[0]}
            </p>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="guardrailKeywords">Never say</Label>
        <Input
          id="guardrailKeywords"
          name="guardrailKeywords"
          defaultValue={agent?.guardrailKeywords?.join(", ")}
          placeholder="e.g. refund, compensation, discount"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated. If composed text contains any of these, the run fails
          outright — it&rsquo;s never proposed for approval. Leave blank for no
          guardrail.
        </p>
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
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="actionIntegrationId">Action account</Label>
        <select
          id="actionIntegrationId"
          name="actionIntegrationId"
          defaultValue={agent?.actionIntegrationId ?? ""}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Organisation&rsquo;s default account</option>
          {gmailIntegrations.map((integration) => (
            <option key={integration.id} value={integration.id}>
              {integration.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Which connected account this agent sends from. Leave as default unless
          this business has connected more than one and needs different agents
          replying from different addresses.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tools</Label>
        <div className="flex flex-col gap-4 rounded-md border border-border p-3">
          {TOOL_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </span>
              {TOOL_REGISTRY.filter((tool) => tool.group === group).map(
                (tool) => (
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
                      checked={toolNames.has(tool.name)}
                      onChange={(e) => toggleTool(tool.name, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{tool.label}</span>
                      <span className="text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
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
