"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EntityStatusSignalConfig } from "@/lib/harness/pipelines/entity-status-signal-pipeline";

export interface EntityTypeOption {
  name: string;
  fields: string[];
}

interface TransitionRow {
  status: string;
  createFoldersProvider: "google-drive" | "sharepoint";
  createFoldersSiteName: string;
  createFoldersRootFolder: string;
  createFoldersSubfolders: string;
  sendEmailToField: string;
  sendEmailSubjectTemplate: string;
  sendEmailBodyTemplate: string;
  notifyTeamsTeamId: string;
  notifyTeamsChannelId: string;
  notifyTeamsMessageTemplate: string;
}

const BLANK_ROW: TransitionRow = {
  status: "",
  createFoldersProvider: "google-drive",
  createFoldersSiteName: "",
  createFoldersRootFolder: "",
  createFoldersSubfolders: "",
  sendEmailToField: "",
  sendEmailSubjectTemplate: "",
  sendEmailBodyTemplate: "",
  notifyTeamsTeamId: "",
  notifyTeamsChannelId: "",
  notifyTeamsMessageTemplate: "",
};

function rowsFromInitial(initial?: EntityStatusSignalConfig): TransitionRow[] {
  if (!initial) return [BLANK_ROW];
  const entries = Object.entries(initial.transitions);
  if (entries.length === 0) return [BLANK_ROW];
  return entries.map(([status, transition]) => ({
    status,
    createFoldersProvider: transition.createFolders?.provider ?? "google-drive",
    createFoldersSiteName: transition.createFolders?.siteName ?? "",
    createFoldersRootFolder: transition.createFolders?.rootFolder ?? "",
    createFoldersSubfolders:
      transition.createFolders?.subfolders.join(", ") ?? "",
    sendEmailToField: transition.sendEmail?.toField ?? "",
    sendEmailSubjectTemplate: transition.sendEmail?.subjectTemplate ?? "",
    sendEmailBodyTemplate: transition.sendEmail?.bodyTemplate ?? "",
    notifyTeamsTeamId: transition.notifyTeams?.teamId ?? "",
    notifyTeamsChannelId: transition.notifyTeams?.channelId ?? "",
    notifyTeamsMessageTemplate: transition.notifyTeams?.messageTemplate ?? "",
  }));
}

/**
 * The structured form for the "entity_status_signal" pipeline
 * (lib/harness/pipelines/entity-status-signal-pipeline.ts) — a business
 * tracks its own record type (a Job, an Application, ...) through status
 * changes reported by an external system (e.g. a Power Automate flow
 * posting to this agent's webhook trigger). One row per status value that
 * should trigger something; a status with no row just updates the record
 * and finishes.
 */
export function EntityStatusSignalFields({
  entityTypes,
  initial,
}: {
  entityTypes: EntityTypeOption[];
  initial?: EntityStatusSignalConfig;
}) {
  const [entityType, setEntityType] = useState(initial?.entityType ?? "");
  const [keyField, setKeyField] = useState(initial?.keyField ?? "");
  const [statusField, setStatusField] = useState(initial?.statusField ?? "");
  const [rows, setRows] = useState<TransitionRow[]>(rowsFromInitial(initial));

  const fields = entityTypes.find((e) => e.name === entityType)?.fields ?? [];

  function updateRow(index: number, patch: Partial<TransitionRow>) {
    setRows((r) =>
      r.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">
        Tracks one of your own catalog types through status changes reported by
        an external system (e.g. a Microsoft List, via a Power Automate flow
        posting to this agent&rsquo;s webhook trigger). No LLM calls — this is a
        deterministic pipeline, not the model deciding what to do.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="esEntityType">Catalog type</Label>
          <select
            id="esEntityType"
            name="esEntityType"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Select a catalog type…</option>
            {entityTypes.map((e) => (
              <option key={e.name} value={e.name}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="esKeyField">Key field</Label>
          <select
            id="esKeyField"
            name="esKeyField"
            value={keyField}
            onChange={(e) => setKeyField(e.target.value)}
            disabled={fields.length === 0}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Select a field…</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Uniquely identifies a record, e.g. jobId.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="esStatusField">Status field</Label>
          <select
            id="esStatusField"
            name="esStatusField"
            value={statusField}
            onChange={(e) => setStatusField(e.target.value)}
            disabled={fields.length === 0}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Select a field…</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Which field on the incoming signal carries the new status.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Label>Status transitions</Label>
        <p className="text-xs text-muted-foreground">
          What happens when the status becomes each value below. A status with
          no row here just updates the record. Templates below may use{" "}
          <code className="rounded bg-muted px-1">{"{fieldName}"}</code> to
          reference the record&rsquo;s own data.
        </p>
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-md border border-border p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                name="esTransitionStatusValue"
                placeholder="Status value, e.g. Approved"
                value={row.status}
                onChange={(e) => updateRow(index, { status: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-medium">
                Create folders (leave root folder blank to skip)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  name="esTransitionCreateFoldersProvider"
                  value={row.createFoldersProvider}
                  onChange={(e) =>
                    updateRow(index, {
                      createFoldersProvider: e.target.value as
                        "google-drive" | "sharepoint",
                    })
                  }
                  className="h-8 rounded-lg border border-border bg-background px-2 text-sm sm:w-40"
                >
                  <option value="google-drive">Google Drive</option>
                  <option value="sharepoint">SharePoint</option>
                </select>
                {row.createFoldersProvider === "sharepoint" && (
                  <Input
                    name="esTransitionCreateFoldersSiteName"
                    placeholder="SharePoint site name"
                    value={row.createFoldersSiteName}
                    onChange={(e) =>
                      updateRow(index, {
                        createFoldersSiteName: e.target.value,
                      })
                    }
                    className="sm:w-48"
                  />
                )}
                <Input
                  name="esTransitionCreateFoldersRootFolder"
                  placeholder="Root folder, e.g. {jobId}"
                  value={row.createFoldersRootFolder}
                  onChange={(e) =>
                    updateRow(index, {
                      createFoldersRootFolder: e.target.value,
                    })
                  }
                  className="flex-1"
                />
              </div>
              {row.createFoldersProvider !== "sharepoint" && (
                <input
                  type="hidden"
                  name="esTransitionCreateFoldersSiteName"
                  value=""
                />
              )}
              <Input
                name="esTransitionCreateFoldersSubfolders"
                placeholder="Subfolders, comma-separated, e.g. Client correspondence, Calculation, Quotation"
                value={row.createFoldersSubfolders}
                onChange={(e) =>
                  updateRow(index, { createFoldersSubfolders: e.target.value })
                }
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-medium">
                Send email (leave subject blank to skip)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  name="esTransitionSendEmailToField"
                  value={row.sendEmailToField}
                  onChange={(e) =>
                    updateRow(index, { sendEmailToField: e.target.value })
                  }
                  disabled={fields.length === 0}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-sm sm:w-48"
                >
                  <option value="">Recipient field…</option>
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <Input
                  name="esTransitionSendEmailSubjectTemplate"
                  placeholder="Subject, e.g. [Job #{jobId}] We've received your enquiry"
                  value={row.sendEmailSubjectTemplate}
                  onChange={(e) =>
                    updateRow(index, {
                      sendEmailSubjectTemplate: e.target.value,
                    })
                  }
                  className="flex-1"
                />
              </div>
              <Textarea
                name="esTransitionSendEmailBodyTemplate"
                placeholder="Body template"
                value={row.sendEmailBodyTemplate}
                onChange={(e) =>
                  updateRow(index, { sendEmailBodyTemplate: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-medium">
                Notify Teams (leave team id blank to skip)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  name="esTransitionNotifyTeamsTeamId"
                  placeholder="Team id"
                  value={row.notifyTeamsTeamId}
                  onChange={(e) =>
                    updateRow(index, { notifyTeamsTeamId: e.target.value })
                  }
                  className="sm:w-48"
                />
                <Input
                  name="esTransitionNotifyTeamsChannelId"
                  placeholder="Channel id"
                  value={row.notifyTeamsChannelId}
                  onChange={(e) =>
                    updateRow(index, { notifyTeamsChannelId: e.target.value })
                  }
                  className="sm:w-64"
                />
              </div>
              <Textarea
                name="esTransitionNotifyTeamsMessageTemplate"
                placeholder="Message, e.g. Job {jobId} needs approval: {approvalUrl}"
                value={row.notifyTeamsMessageTemplate}
                onChange={(e) =>
                  updateRow(index, {
                    notifyTeamsMessageTemplate: e.target.value,
                  })
                }
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Team id and channel id come from Teams&rsquo; own &ldquo;Get
                link to channel&rdquo;. Posts as whichever person connected
                Teams in Settings, not as a separate bot.
              </p>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setRows((r) => [...r, { ...BLANK_ROW }])}
        >
          Add transition
        </Button>
      </div>
    </div>
  );
}
