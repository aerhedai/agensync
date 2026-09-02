import type { CategoryType } from "@/lib/agents/schemas";
import { pipelineConfigSchema as entityCorrespondenceArchiveConfigSchema } from "@/lib/harness/pipelines/entity-correspondence-archive-pipeline";
import { pipelineConfigSchema as entityStatusSignalConfigSchema } from "@/lib/harness/pipelines/entity-status-signal-pipeline";

// Pure FormData-parsing helpers for the two structured pipeline configs
// (components/agents/entity-status-signal-fields.tsx and
// entity-correspondence-archive-fields.tsx) — split out of
// app/(app)/agents/actions.ts so this logic is unit-testable without
// mocking Clerk auth or next/navigation, and because a "use server" file's
// exports must all be async server actions, which these plain parsing
// functions aren't.

function stringAt(values: FormDataEntryValue[], i: number): string {
  const value = values[i];
  return typeof value === "string" ? value : "";
}

// A transition's optional createFolders/sendEmail/notifyTeams block is
// included only when its own "this block is meaningful" field is non-empty
// (rootFolder / subjectTemplate / teamId respectively) — deliberately not a
// checkbox: FormData only includes a checkbox's entry when it's checked, so
// an unchecked box in the middle of a repeated row would silently shift
// every array below it out of index alignment with the others. Every text
// input, checked or not, always submits (even empty), which is what keeps
// the parallel arrays reliably zippable by index — same reasoning already
// applied to extractionFields' own parallel-array parsing in actions.ts.
export function parseEntityStatusSignalConfig(
  formData: FormData,
): Record<string, unknown> {
  const statusValues = formData.getAll("esTransitionStatusValue");
  const createFoldersProvider = formData.getAll(
    "esTransitionCreateFoldersProvider",
  );
  const createFoldersSiteName = formData.getAll(
    "esTransitionCreateFoldersSiteName",
  );
  const createFoldersRootFolder = formData.getAll(
    "esTransitionCreateFoldersRootFolder",
  );
  const createFoldersSubfolders = formData.getAll(
    "esTransitionCreateFoldersSubfolders",
  );
  const sendEmailToField = formData.getAll("esTransitionSendEmailToField");
  const sendEmailSubjectTemplate = formData.getAll(
    "esTransitionSendEmailSubjectTemplate",
  );
  const sendEmailBodyTemplate = formData.getAll(
    "esTransitionSendEmailBodyTemplate",
  );
  const notifyTeamsTeamId = formData.getAll("esTransitionNotifyTeamsTeamId");
  const notifyTeamsChannelId = formData.getAll(
    "esTransitionNotifyTeamsChannelId",
  );
  const notifyTeamsMessageTemplate = formData.getAll(
    "esTransitionNotifyTeamsMessageTemplate",
  );

  const transitions: Record<string, unknown> = {};
  statusValues.forEach((rawStatus, i) => {
    const status = typeof rawStatus === "string" ? rawStatus.trim() : "";
    if (!status) return;

    const rootFolder = stringAt(createFoldersRootFolder, i);
    const subjectTemplate = stringAt(sendEmailSubjectTemplate, i);
    const teamId = stringAt(notifyTeamsTeamId, i);

    transitions[status] = {
      ...(rootFolder && {
        createFolders: {
          provider: stringAt(createFoldersProvider, i) || "google-drive",
          siteName: stringAt(createFoldersSiteName, i) || undefined,
          rootFolder,
          subfolders: stringAt(createFoldersSubfolders, i)
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0),
        },
      }),
      ...(subjectTemplate && {
        sendEmail: {
          toField: stringAt(sendEmailToField, i),
          subjectTemplate,
          bodyTemplate: stringAt(sendEmailBodyTemplate, i),
        },
      }),
      ...(teamId && {
        notifyTeams: {
          teamId,
          channelId: stringAt(notifyTeamsChannelId, i),
          messageTemplate: stringAt(notifyTeamsMessageTemplate, i),
        },
      }),
    };
  });

  return {
    entityType: formData.get("esEntityType"),
    keyField: formData.get("esKeyField"),
    statusField: formData.get("esStatusField"),
    transitions,
  };
}

export function parseEntityCorrespondenceArchiveConfig(
  formData: FormData,
): Record<string, unknown> {
  const siteName = formData.get("ecaSiteName");
  return {
    entityType: formData.get("ecaEntityType"),
    keyField: formData.get("ecaKeyField"),
    subjectPattern: formData.get("ecaSubjectPattern"),
    provider: formData.get("ecaProvider"),
    siteName: typeof siteName === "string" && siteName ? siteName : undefined,
    rootFolderField: formData.get("ecaRootFolderField"),
    correspondenceSubfolder: formData.get("ecaCorrespondenceSubfolder"),
    correspondenceFilename: formData.get("ecaCorrespondenceFilename"),
  };
}

export function parsePipelineConfigForm(
  categoryType: FormDataEntryValue | null,
  formData: FormData,
): Record<string, unknown> {
  if (categoryType === "entity_status_signal") {
    return parseEntityStatusSignalConfig(formData);
  }
  if (categoryType === "entity_correspondence_archive") {
    return parseEntityCorrespondenceArchiveConfig(formData);
  }
  return {};
}

// Each structured pipeline owns its own pipelineConfigSchema
// (lib/harness/pipelines/) — validated here, once categoryType is known,
// rather than in agentInputSchema itself, so there's exactly one schema per
// pipeline shape instead of a second copy of it. A failure here surfaces
// as a single combined message under fieldErrors.pipelineConfig; the
// individual sub-form fields already do their own required-field
// validation in the browser, so this is mostly a defense-in-depth path
// (e.g. an invalid regex, a genuinely malformed submission).
export function validatePipelineConfig(
  categoryType: CategoryType,
  pipelineConfig: Record<string, unknown>,
): { error: string } | { config: Record<string, unknown> } {
  if (categoryType === "entity_status_signal") {
    const result = entityStatusSignalConfigSchema.safeParse(pipelineConfig);
    if (!result.success) {
      return { error: result.error.issues.map((i) => i.message).join("; ") };
    }
    return { config: result.data };
  }
  if (categoryType === "entity_correspondence_archive") {
    const result =
      entityCorrespondenceArchiveConfigSchema.safeParse(pipelineConfig);
    if (!result.success) {
      return { error: result.error.issues.map((i) => i.message).join("; ") };
    }
    return { config: result.data };
  }
  return { config: {} };
}
