"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityTypeOption } from "@/components/agents/entity-status-signal-fields";
import type { EntityCorrespondenceArchiveConfig } from "@/lib/harness/pipelines/entity-correspondence-archive-pipeline";

/**
 * The structured form for the "entity_correspondence_archive" pipeline
 * (lib/harness/pipelines/entity-correspondence-archive-pipeline.ts) — an
 * EMAIL-triggered agent that finds a record from a reference token in a
 * reply's subject line and archives the message (and any attachments)
 * into that record's folder. No LLM calls.
 */
export function EntityCorrespondenceArchiveFields({
  entityTypes,
  initial,
}: {
  entityTypes: EntityTypeOption[];
  initial?: EntityCorrespondenceArchiveConfig;
}) {
  const [entityType, setEntityType] = useState(initial?.entityType ?? "");
  const [keyField, setKeyField] = useState(initial?.keyField ?? "");
  const [rootFolderField, setRootFolderField] = useState(
    initial?.rootFolderField ?? "",
  );
  const [provider, setProvider] = useState<"google-drive" | "sharepoint">(
    initial?.provider ?? "google-drive",
  );

  const fields = entityTypes.find((e) => e.name === entityType)?.fields ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">
        Matches a reply&rsquo;s subject line against a pattern, finds the record
        it identifies, and archives the message body plus any attachments into
        that record&rsquo;s folder. No LLM calls.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="ecaEntityType">Catalog type</Label>
          <select
            id="ecaEntityType"
            name="ecaEntityType"
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
          <Label htmlFor="ecaKeyField">Key field</Label>
          <select
            id="ecaKeyField"
            name="ecaKeyField"
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
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="ecaSubjectPattern">Subject reference pattern</Label>
        <Input
          id="ecaSubjectPattern"
          name="ecaSubjectPattern"
          defaultValue={initial?.subjectPattern}
          placeholder={"\\[Job #([A-Za-z0-9-]+)\\]"}
        />
        <p className="text-xs text-muted-foreground">
          A regex with exactly one capture group — the matched text is looked up
          against the key field above. Matches a subject containing e.g.
          &ldquo;[Job #1042]&rdquo;.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="ecaProvider">Storage</Label>
          <select
            id="ecaProvider"
            name="ecaProvider"
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value as "google-drive" | "sharepoint")
            }
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="google-drive">Google Drive</option>
            <option value="sharepoint">SharePoint</option>
          </select>
        </div>
        {provider === "sharepoint" && (
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="ecaSiteName">SharePoint site name</Label>
            <Input
              id="ecaSiteName"
              name="ecaSiteName"
              defaultValue={initial?.siteName}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="ecaRootFolderField">Root folder field</Label>
        <select
          id="ecaRootFolderField"
          name="ecaRootFolderField"
          value={rootFolderField}
          onChange={(e) => setRootFolderField(e.target.value)}
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
          Which record field names its root folder — falls back to the key
          field&rsquo;s own value if this field is blank on a given record.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="ecaCorrespondenceSubfolder">
            Correspondence subfolder
          </Label>
          <Input
            id="ecaCorrespondenceSubfolder"
            name="ecaCorrespondenceSubfolder"
            defaultValue={initial?.correspondenceSubfolder}
            placeholder="Client correspondence"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="ecaCorrespondenceFilename">Filename</Label>
          <Input
            id="ecaCorrespondenceFilename"
            name="ecaCorrespondenceFilename"
            defaultValue={initial?.correspondenceFilename}
            placeholder="correspondence.txt"
          />
        </div>
      </div>
    </div>
  );
}
