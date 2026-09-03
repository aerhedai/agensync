"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Editor for an agent's step programme (docs/agent-step-engine-design.md).
 *
 * A JSON editor rather than a row-per-step visual builder, deliberately and
 * for now: steps nest (a `branch` holds arms of steps; an `act`'s args hold
 * objects and arrays), and a flat form can't express that without an
 * encoding scheme more error-prone than the JSON it replaces. The examples
 * below carry most of the ergonomic weight — a business starts from one
 * rather than from an empty box.
 *
 * Validation is server-side against the same schema the runtime uses
 * (lib/harness/pipelines/steps-pipeline.ts), so the form can never accept a
 * programme the step runner would reject.
 */

const EXAMPLES: { label: string; hint: string; json: string }[] = [
  {
    label: "File an email as a record",
    hint: "Pull details out of an inbound email and save them. Two steps, one LLM call.",
    json: JSON.stringify(
      {
        steps: [
          {
            kind: "extract",
            fields: [
              { name: "number", description: "the invoice number" },
              { name: "total", description: "the amount due" },
            ],
          },
          {
            kind: "act",
            tool: "create_record",
            args: {
              recordType: "Invoice",
              data: { number: "{number}", total: "{total}" },
            },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    label: "Look up, price, and reply",
    hint: "Find a record, compute a total from it, write a reply. The send is approval-gated.",
    json: JSON.stringify(
      {
        steps: [
          {
            kind: "extract",
            fields: [
              { name: "product", description: "the product asked about" },
              { name: "quantity", description: "how many units" },
            ],
          },
          {
            kind: "lookup",
            as: "item",
            recordType: "Product",
            match: { by: "search", query: "{product}" },
            required: true,
          },
          {
            kind: "compute",
            as: "total",
            operation: "multiply",
            operands: ["{item.data.unitPrice}", "{quantity}"],
          },
          {
            kind: "compose",
            as: "body",
            instructions: "Write a short, professional quote email.",
            facts: ["product", "quantity", "total"],
          },
          {
            kind: "act",
            tool: "send_email",
            args: {
              to: "{senderEmail}",
              subject: "Your quote",
              body: "{body}",
            },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    label: "Branch on a condition",
    hint: "Optional lookup, then take a different path depending on whether it found anything.",
    json: JSON.stringify(
      {
        steps: [
          {
            kind: "lookup",
            as: "customer",
            recordType: "Customer",
            match: { by: "field", field: "email", value: "{senderEmail}" },
            required: false,
          },
          {
            kind: "branch",
            when: { left: "{customer}", operator: "exists" },
            then: [
              {
                kind: "compute",
                as: "greeting",
                operation: "template",
                operands: ["Hello {customer.data.name},"],
              },
            ],
            otherwise: [
              {
                kind: "compute",
                as: "greeting",
                operation: "template",
                operands: ["Hello,"],
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  },
];

export function StepProgrammeFields({
  initial,
}: {
  initial?: Record<string, unknown>;
}) {
  const [value, setValue] = useState(() =>
    initial && Object.keys(initial).length > 0
      ? JSON.stringify(initial, null, 2)
      : EXAMPLES[0]!.json,
  );

  // Parse-only feedback. The server still validates against the runtime
  // schema — this just catches a typo before a round trip.
  let syntaxError: string | null = null;
  try {
    JSON.parse(value);
  } catch (error) {
    syntaxError = error instanceof Error ? error.message : "Invalid JSON";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="stepsJson">Steps</Label>
        <p className="text-xs text-muted-foreground">
          Runs in order. <span className="font-mono">extract</span> and{" "}
          <span className="font-mono">compose</span> each cost one narrow LLM
          call; <span className="font-mono">lookup</span>,{" "}
          <span className="font-mono">compute</span>,{" "}
          <span className="font-mono">branch</span> and{" "}
          <span className="font-mono">act</span> are free. Reference an earlier
          step&rsquo;s value with <span className="font-mono">{"{name}"}</span>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <Button
            key={example.label}
            type="button"
            variant="outline"
            onClick={() => setValue(example.json)}
            title={example.hint}
          >
            {example.label}
          </Button>
        ))}
      </div>

      <textarea
        id="stepsJson"
        name="stepsJson"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        rows={18}
        className="w-full rounded-md border border-border bg-transparent p-3 font-mono text-xs"
      />

      {syntaxError && (
        <p className="text-sm text-destructive">
          Not valid JSON yet — {syntaxError}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        A tool named in an <span className="font-mono">act</span> step still has
        to be granted below, and an approval-gated one still pauses the run for
        a human.
      </p>
    </div>
  );
}
