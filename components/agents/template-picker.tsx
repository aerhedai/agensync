"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Choosing a starting point for a new agent.
 *
 * This is the *only* place anything business-specific appears in agent
 * creation. Every other field on the form is generic — a name, what it
 * should do, which tools it may use — and a template just pre-fills the
 * steps and ticks the tools those steps need (CLAUDE.md §3: a vertical is
 * a template, never a primitive).
 *
 * Installing one is a starting point, not a commitment: everything it
 * fills in stays editable afterwards.
 */

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  steps: unknown;
  suggestedTools: string[];
  builtIn: boolean;
}

export function TemplatePicker({
  templates,
  onInstall,
}: {
  templates: TemplateOption[];
  onInstall: (template: TemplateOption) => void;
}) {
  if (templates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Label>Start from a template</Label>
      <p className="text-xs text-muted-foreground">
        Fills in the steps and ticks the tools they need. Everything stays
        editable afterwards — or skip this and build the steps yourself.
      </p>
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{template.name}</p>
              <p className="text-xs text-muted-foreground">
                {template.description}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onInstall(template)}
            >
              Use this
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
