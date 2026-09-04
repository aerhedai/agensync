"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { STEP_SNIPPETS, type StepSnippet } from "@/lib/harness/steps/snippets";

/**
 * Editor for an agent's step programme (docs/agent-step-engine-design.md).
 *
 * A JSON editor rather than a row-per-step visual builder, deliberately and
 * for now: steps nest (a `branch` holds arms of steps; an `act`'s args hold
 * objects and arrays), and a flat form can't express that without an
 * encoding scheme more error-prone than the JSON it replaces.
 *
 * The buttons below insert one step of a given kind. They are deliberately
 * *syntax*, not process — a bare `lookup` with placeholder values, not "look
 * up, price, and reply". Whole worked processes belong in the template
 * picker, which stores them as data a business can edit and save its own
 * versions of (CLAUDE.md §3). This section used to carry three complete
 * business processes, one of which duplicated a template outright, which put
 * the same vertical in two places and made the vertical the default for
 * every new agent.
 *
 * Validation is server-side against the same schema the runtime uses
 * (lib/harness/pipelines/steps-pipeline.ts), so the form can never accept a
 * programme the step runner would reject.
 */

/**
 * What a brand-new agent's step editor starts with.
 *
 * An empty programme rather than a worked example: the template picker sits
 * directly above this and is the better answer to "where do I start", and a
 * pre-filled invoice pipeline made one industry the default for everyone.
 */
export const DEFAULT_STEPS_JSON = JSON.stringify({ steps: [] }, null, 2);

export function StepProgrammeFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Parse-only feedback. The server still validates against the runtime
  // schema — this just catches a typo before a round trip.
  let parsed: unknown = null;
  let syntaxError: string | null = null;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    syntaxError = error instanceof Error ? error.message : "Invalid JSON";
  }

  /**
   * Steps sitting after a top-level `act`, which never run.
   *
   * `act` is terminal — the runner returns as soon as one completes. Nothing
   * rejects a programme with steps after it, so without this the only symptom
   * is a step that silently does nothing, which is the worst way to find out.
   * A warning rather than a hard error: the schema accepts these programmes,
   * some are already stored, and refusing to save one would be a new way to
   * lock someone out of their own agent.
   *
   * Top level only. An `act` inside a branch arm ends the run too, but a
   * later top-level step there is often the deliberate "either way, then
   * this" shape, so flagging it would cry wolf.
   */
  const stepsAfterAct = (() => {
    const steps =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as { steps?: unknown }).steps
        : undefined;
    if (!Array.isArray(steps)) return 0;
    const actIndex = steps.findIndex(
      (s) =>
        s && typeof s === "object" && (s as { kind?: string }).kind === "act",
    );
    return actIndex === -1 ? 0 : steps.length - actIndex - 1;
  })();

  /**
   * Appends a step rather than replacing the whole programme.
   *
   * Replacing is what the old whole-process buttons did, and it silently
   * discarded whatever someone had already written. Appending composes with
   * a template: install one, then add a step to it.
   */
  function appendStep(snippet: StepSnippet) {
    const programme =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const steps = Array.isArray(programme.steps) ? programme.steps : [];
    onChange(
      JSON.stringify(
        { ...programme, steps: [...steps, snippet.step] },
        null,
        2,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="stepsJson">Steps</Label>
        <p className="text-xs text-muted-foreground">
          Runs in order. <span className="font-mono">extract</span>,{" "}
          <span className="font-mono">compose</span> and{" "}
          <span className="font-mono">retrieve</span> each cost one narrow LLM
          call; <span className="font-mono">lookup</span>,{" "}
          <span className="font-mono">compute</span>,{" "}
          <span className="font-mono">branch</span> and{" "}
          <span className="font-mono">act</span> are free. Reference an earlier
          step&rsquo;s value with <span className="font-mono">{"{name}"}</span>.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">
          Add a step, then edit its values:
        </span>
        <div className="flex flex-wrap gap-2">
          {STEP_SNIPPETS.map((snippet) => (
            <Button
              key={snippet.label}
              type="button"
              variant="outline"
              size="sm"
              disabled={syntaxError !== null}
              onClick={() => appendStep(snippet)}
              title={snippet.hint}
              className="font-mono text-xs"
            >
              + {snippet.label}
            </Button>
          ))}
        </div>
      </div>

      <textarea
        id="stepsJson"
        name="stepsJson"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={18}
        className="w-full rounded-md border border-border bg-transparent p-3 font-mono text-xs"
      />

      {syntaxError && (
        <p className="text-sm text-destructive">
          Not valid JSON yet — {syntaxError}
        </p>
      )}

      {stepsAfterAct > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          {stepsAfterAct === 1 ? "The step" : `The ${stepsAfterAct} steps`}{" "}
          after your <span className="font-mono">act</span> won&rsquo;t run —{" "}
          <span className="font-mono">act</span> ends the run. Move{" "}
          {stepsAfterAct === 1 ? "it" : "them"} above the{" "}
          <span className="font-mono">act</span> step.
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
