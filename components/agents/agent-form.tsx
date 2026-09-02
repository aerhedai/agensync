"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AgentFormState } from "@/app/(app)/agents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityCorrespondenceArchiveFields } from "@/components/agents/entity-correspondence-archive-fields";
import {
  EntityStatusSignalFields,
  type EntityTypeOption,
} from "@/components/agents/entity-status-signal-fields";
import type { Agent } from "@/lib/generated/prisma/client";
import type { CategoryType } from "@/lib/agents/schemas";
import type { ExtractionFieldConfig } from "@/lib/agents/extraction-fields";
import type { EntityCorrespondenceArchiveConfig } from "@/lib/harness/pipelines/entity-correspondence-archive-pipeline";
import type { EntityStatusSignalConfig } from "@/lib/harness/pipelines/entity-status-signal-pipeline";
import { TOOL_REGISTRY } from "@/lib/mcp/tool-registry";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

const CATEGORY_TYPE_OPTIONS: {
  value: CategoryType;
  label: string;
  description: string;
}[] = [
  {
    value: "acknowledge_reply",
    label: "Acknowledge & Reply",
    description:
      'Extract whatever facts you define from the message, optionally look up the customer, write an appropriate reply, apply your own guardrail — no code needed. Use this for most new categories (case inquiries, maintenance requests, general questions, complaints, anything that\'s fundamentally "read it and respond").',
  },
  {
    value: "quote",
    label: "Lookup & Quote",
    description:
      "The built-in product/quantity pricing flow: find the customer, find the product, check stock, calculate a total, send a quote. Fixed logic — configure keywords, model, and tools, not the sequence itself.",
  },
  {
    value: "loop",
    label: "Free-form (advanced)",
    description:
      "The model decides which tools to call and in what order, turn by turn. More flexible, less predictable — this project's own findings are that tool-call failures happen here, not in the pipeline modes above. Prefer Acknowledge & Reply unless you specifically need this.",
  },
  {
    value: "entity_status_signal",
    label: "Track status changes (webhook)",
    description:
      "Zero LLM calls. Triggered by a webhook (e.g. a Power Automate flow) reporting a status change on one of your catalog types — creates folders, sends an email, and/or notifies Teams depending on the new status.",
  },
  {
    value: "entity_correspondence_archive",
    label: "Archive correspondence (email)",
    description:
      "Zero LLM calls. Finds a record from a reference token in a reply's subject line and archives the message plus any attachments into that record's folder.",
  },
];

function deriveCategoryType(agent?: AgentFormValues): CategoryType {
  if (!agent) return "acknowledge_reply";
  if (agent.executionMode !== "HARNESS") return "loop";
  if (
    agent.pipelineKey === "entity_status_signal" ||
    agent.pipelineKey === "entity_correspondence_archive"
  ) {
    return agent.pipelineKey;
  }
  return agent.pipelineKey === "quote" ? "quote" : "acknowledge_reply";
}

type AgentFormValues = Pick<
  Agent,
  | "name"
  | "description"
  | "instructions"
  | "model"
  | "keywords"
  | "replySubjectTemplate"
  | "executionMode"
  | "pipelineKey"
  | "guardrailKeywords"
  | "actionIntegrationId"
> & {
  toolNames?: string[];
  extractionFields?: ExtractionFieldConfig[];
};

export function AgentForm({
  action,
  agent,
  submitLabel,
  entityTypes = [],
  gmailIntegrations = [],
  initialEntityStatusSignalConfig,
  initialEntityCorrespondenceArchiveConfig,
}: {
  action: (
    prevState: AgentFormState,
    formData: FormData,
  ) => Promise<AgentFormState>;
  agent?: AgentFormValues;
  submitLabel: string;
  // The organisation's own custom entity types (lib/entities/), each with
  // its own field list — an extraction field can optionally look one up,
  // and the two structured pipeline configs below reference a type's
  // fields directly. Empty by default so this component doesn't break for
  // any caller that hasn't been updated to fetch and pass them.
  entityTypes?: EntityTypeOption[];
  // The organisation's connected Gmail accounts — offered as the "action
  // account" this agent's send_email tool uses. Empty by default for the
  // same reason as entityTypes above.
  gmailIntegrations?: { id: string; name: string }[];
  // Pre-parsed server-side (app/(app)/agents/[id]/edit/page.tsx) against
  // each pipeline's own schema — kept out of this "use client" component
  // so it never needs to import a pipeline module itself (those pull in
  // server-only code: Prisma, the MCP client, etc.).
  initialEntityStatusSignalConfig?: EntityStatusSignalConfig;
  initialEntityCorrespondenceArchiveConfig?: EntityCorrespondenceArchiveConfig;
}) {
  const [state, formAction] = useActionState<AgentFormState, FormData>(
    action,
    {},
  );
  const grantedTools = new Set(agent?.toolNames ?? []);
  const [categoryType, setCategoryType] = useState<CategoryType>(
    deriveCategoryType(agent),
  );
  const [extractionFields, setExtractionFields] = useState<
    ExtractionFieldConfig[]
  >(agent?.extractionFields ?? []);

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
        <Label>Category type</Label>
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          {CATEGORY_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-start gap-2 text-sm"
              htmlFor={`categoryType-${option.value}`}
            >
              <input
                type="radio"
                id={`categoryType-${option.value}`}
                name="categoryType"
                value={option.value}
                checked={categoryType === option.value}
                onChange={() => setCategoryType(option.value)}
                className="mt-0.5 h-4 w-4 border-border"
              />
              <span className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
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

      {categoryType === "acknowledge_reply" && (
        <div className="flex flex-col gap-2">
          <Label>Fields to extract</Label>
          <p className="text-xs text-muted-foreground">
            What to pull out of the message, beyond the customer&rsquo;s email
            (always extracted automatically). Each becomes a fact available when
            writing the reply — optionally, use the extracted value to look up a
            record in one of your custom entity types (needs the &ldquo;Search
            custom entity&rdquo; tool granted below).
          </p>
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            {extractionFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No extra fields — the reply will be written from the
                customer&rsquo;s identity alone.
              </p>
            )}
            {extractionFields.map((field, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  name="extractionFieldName"
                  placeholder="Field name, e.g. caseNumber"
                  value={field.name}
                  onChange={(e) =>
                    setExtractionFields((fields) =>
                      fields.map((f, i) =>
                        i === index ? { ...f, name: e.target.value } : f,
                      ),
                    )
                  }
                  className="sm:w-48"
                />
                <Input
                  name="extractionFieldDescription"
                  placeholder="What it is, e.g. the case number if mentioned"
                  value={field.description}
                  onChange={(e) =>
                    setExtractionFields((fields) =>
                      fields.map((f, i) =>
                        i === index ? { ...f, description: e.target.value } : f,
                      ),
                    )
                  }
                  className="flex-1"
                />
                <select
                  name="extractionFieldLookupEntityType"
                  value={field.lookupEntityType ?? ""}
                  onChange={(e) =>
                    setExtractionFields((fields) =>
                      fields.map((f, i) =>
                        i === index
                          ? {
                              ...f,
                              lookupEntityType: e.target.value || undefined,
                            }
                          : f,
                      ),
                    )
                  }
                  className="h-8 rounded-lg border border-border bg-background px-2 text-sm sm:w-40"
                >
                  <option value="">Don&rsquo;t look up</option>
                  {entityTypes.map((e) => (
                    <option key={e.name} value={e.name}>
                      Look up in {e.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setExtractionFields((fields) =>
                      fields.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                setExtractionFields((fields) => [
                  ...fields,
                  { name: "", description: "" },
                ])
              }
            >
              Add field
            </Button>
          </div>
          {state.fieldErrors?.extractionFields && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.extractionFields[0]}
            </p>
          )}
        </div>
      )}

      {categoryType === "entity_status_signal" && (
        <div className="flex flex-col gap-2">
          <Label>Status signal configuration</Label>
          <EntityStatusSignalFields
            entityTypes={entityTypes}
            initial={initialEntityStatusSignalConfig}
          />
          {state.fieldErrors?.pipelineConfig && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.pipelineConfig[0]}
            </p>
          )}
        </div>
      )}

      {categoryType === "entity_correspondence_archive" && (
        <div className="flex flex-col gap-2">
          <Label>Correspondence archive configuration</Label>
          <EntityCorrespondenceArchiveFields
            entityTypes={entityTypes}
            initial={initialEntityCorrespondenceArchiveConfig}
          />
          {state.fieldErrors?.pipelineConfig && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.pipelineConfig[0]}
            </p>
          )}
        </div>
      )}

      {categoryType === "acknowledge_reply" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="guardrailKeywords">
            Never say (guardrail keywords)
          </Label>
          <Input
            id="guardrailKeywords"
            name="guardrailKeywords"
            defaultValue={agent?.guardrailKeywords?.join(", ")}
            placeholder="e.g. refund, compensation, discount"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. If the composed reply contains any of these words
            or phrases, it&rsquo;s refused outright — never proposed for
            approval, no exceptions. Leave blank for no guardrail.
          </p>
        </div>
      )}

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

      {categoryType !== "entity_status_signal" &&
        categoryType !== "entity_correspondence_archive" && (
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
        )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="actionIntegrationId">Action account</Label>
        <select
          id="actionIntegrationId"
          name="actionIntegrationId"
          defaultValue={agent?.actionIntegrationId ?? ""}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Organisation&rsquo;s default Gmail account</option>
          {gmailIntegrations.map((integration) => (
            <option key={integration.id} value={integration.id}>
              {integration.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Which connected Gmail account this agent&rsquo;s send_email tool sends
          from. Leave as default unless this business has connected more than
          one Gmail account and needs different categories to reply from
          different addresses.
        </p>
        {state.fieldErrors?.actionIntegrationId && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.actionIntegrationId[0]}
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
