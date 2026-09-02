import { describe, expect, it } from "vitest";

import {
  parseEntityCorrespondenceArchiveConfig,
  parseEntityStatusSignalConfig,
  validatePipelineConfig,
} from "@/lib/agents/pipeline-config-form";

function formDataFromRows(
  rows: Record<string, string[]>,
  flat: Record<string, string> = {},
): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(flat)) {
    formData.set(key, value);
  }
  for (const [key, values] of Object.entries(rows)) {
    for (const value of values) {
      formData.append(key, value);
    }
  }
  return formData;
}

describe("parseEntityStatusSignalConfig", () => {
  it("includes a transition's createFolders/sendEmail/notifyTeams block only when its own marker field is non-empty", () => {
    const formData = formDataFromRows(
      {
        esTransitionStatusValue: ["Approved"],
        esTransitionCreateFoldersProvider: ["google-drive"],
        esTransitionCreateFoldersSiteName: [""],
        esTransitionCreateFoldersRootFolder: ["{jobId}"],
        esTransitionCreateFoldersSubfolders: [
          "Client correspondence, Calculation, Quotation",
        ],
        esTransitionSendEmailToField: [""],
        esTransitionSendEmailSubjectTemplate: [""],
        esTransitionSendEmailBodyTemplate: [""],
        esTransitionNotifyTeamsTeamId: [""],
        esTransitionNotifyTeamsChannelId: [""],
        esTransitionNotifyTeamsMessageTemplate: [""],
      },
      { esEntityType: "Job", esKeyField: "jobId", esStatusField: "status" },
    );

    const config = parseEntityStatusSignalConfig(formData);

    expect(config).toMatchObject({
      entityType: "Job",
      keyField: "jobId",
      statusField: "status",
      transitions: {
        Approved: {
          createFolders: {
            provider: "google-drive",
            rootFolder: "{jobId}",
            subfolders: ["Client correspondence", "Calculation", "Quotation"],
          },
        },
      },
    });
    const approved = (config.transitions as Record<string, unknown>)
      .Approved as Record<string, unknown>;
    expect(approved.sendEmail).toBeUndefined();
    expect(approved.notifyTeams).toBeUndefined();
  });

  it("keeps multiple transition rows correctly aligned by index, even with different blocks enabled per row", () => {
    const formData = formDataFromRows({
      esTransitionStatusValue: ["Approved", "Rejected"],
      esTransitionCreateFoldersProvider: ["google-drive", "google-drive"],
      esTransitionCreateFoldersSiteName: ["", ""],
      esTransitionCreateFoldersRootFolder: ["{jobId}", ""],
      esTransitionCreateFoldersSubfolders: ["Quotation", ""],
      esTransitionSendEmailToField: ["", "customerEmail"],
      esTransitionSendEmailSubjectTemplate: [
        "",
        "Job {jobId} was not approved",
      ],
      esTransitionSendEmailBodyTemplate: ["", "Sorry, this job was rejected."],
      esTransitionNotifyTeamsTeamId: ["", ""],
      esTransitionNotifyTeamsChannelId: ["", ""],
      esTransitionNotifyTeamsMessageTemplate: ["", ""],
    });

    const config = parseEntityStatusSignalConfig(formData);
    const transitions = config.transitions as Record<
      string,
      { createFolders?: unknown; sendEmail?: { subjectTemplate: string } }
    >;

    expect(transitions.Approved?.createFolders).toBeDefined();
    expect(transitions.Approved?.sendEmail).toBeUndefined();
    expect(transitions.Rejected?.createFolders).toBeUndefined();
    expect(transitions.Rejected?.sendEmail?.subjectTemplate).toBe(
      "Job {jobId} was not approved",
    );
  });

  it("skips a row with a blank status value", () => {
    const formData = formDataFromRows({
      esTransitionStatusValue: ["", "Approved"],
      esTransitionCreateFoldersProvider: ["google-drive", "google-drive"],
      esTransitionCreateFoldersSiteName: ["", ""],
      esTransitionCreateFoldersRootFolder: ["{jobId}", "{jobId}"],
      esTransitionCreateFoldersSubfolders: ["", ""],
      esTransitionSendEmailToField: ["", ""],
      esTransitionSendEmailSubjectTemplate: ["", ""],
      esTransitionSendEmailBodyTemplate: ["", ""],
      esTransitionNotifyTeamsTeamId: ["", ""],
      esTransitionNotifyTeamsChannelId: ["", ""],
      esTransitionNotifyTeamsMessageTemplate: ["", ""],
    });

    const config = parseEntityStatusSignalConfig(formData);

    expect(Object.keys(config.transitions as Record<string, unknown>)).toEqual([
      "Approved",
    ]);
  });
});

describe("parseEntityCorrespondenceArchiveConfig", () => {
  it("omits siteName when blank rather than passing an empty string", () => {
    const formData = formDataFromRows(
      {},
      {
        ecaEntityType: "Job",
        ecaKeyField: "jobId",
        ecaSubjectPattern: "\\[Job #([A-Za-z0-9-]+)\\]",
        ecaProvider: "google-drive",
        ecaSiteName: "",
        ecaRootFolderField: "jobId",
        ecaCorrespondenceSubfolder: "Client correspondence",
        ecaCorrespondenceFilename: "correspondence.txt",
      },
    );

    const config = parseEntityCorrespondenceArchiveConfig(formData);

    expect(config.siteName).toBeUndefined();
    expect(config).toMatchObject({
      entityType: "Job",
      keyField: "jobId",
      subjectPattern: "\\[Job #([A-Za-z0-9-]+)\\]",
      provider: "google-drive",
      rootFolderField: "jobId",
      correspondenceSubfolder: "Client correspondence",
      correspondenceFilename: "correspondence.txt",
    });
  });

  it("keeps siteName when set", () => {
    const formData = formDataFromRows(
      {},
      {
        ecaEntityType: "Job",
        ecaKeyField: "jobId",
        ecaSubjectPattern: "\\[Job #([A-Za-z0-9-]+)\\]",
        ecaProvider: "sharepoint",
        ecaSiteName: "FSWD Quotes",
        ecaRootFolderField: "jobId",
        ecaCorrespondenceSubfolder: "Client correspondence",
        ecaCorrespondenceFilename: "correspondence.txt",
      },
    );

    const config = parseEntityCorrespondenceArchiveConfig(formData);

    expect(config.siteName).toBe("FSWD Quotes");
  });
});

describe("validatePipelineConfig", () => {
  it("returns an error for entity_status_signal when required fields are missing", () => {
    const result = validatePipelineConfig("entity_status_signal", {
      entityType: "",
      keyField: "",
      statusField: "",
      transitions: {},
    });

    expect("error" in result).toBe(true);
  });

  it("returns the validated config for a well-formed entity_status_signal submission", () => {
    const result = validatePipelineConfig("entity_status_signal", {
      entityType: "Job",
      keyField: "jobId",
      statusField: "status",
      transitions: {
        Approved: {
          createFolders: {
            provider: "google-drive",
            rootFolder: "{jobId}",
            subfolders: [],
          },
        },
      },
    });

    expect("config" in result).toBe(true);
  });

  it("returns an error for entity_correspondence_archive with an empty subjectPattern", () => {
    const result = validatePipelineConfig("entity_correspondence_archive", {
      entityType: "Job",
      keyField: "jobId",
      subjectPattern: "",
      provider: "google-drive",
      rootFolderField: "jobId",
      correspondenceSubfolder: "Client correspondence",
      correspondenceFilename: "correspondence.txt",
    });

    expect("error" in result).toBe(true);
  });

  it("returns an empty config for category types with no structured pipelineConfig", () => {
    const result = validatePipelineConfig("acknowledge_reply", {
      entityType: "should be ignored",
    });

    expect(result).toEqual({ config: {} });
  });
});
