import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { z } from "zod";

import {
  ensureFolderPath as ensureDriveFolderPath,
  resolveAndDownloadFile as resolveAndDownloadDriveFile,
  uploadOrReplaceFile as uploadOrReplaceDriveFile,
} from "@/lib/integrations/google-drive/client";
import {
  getValidGoogleDriveAccessToken,
  getValidSharePointAccessToken,
} from "@/lib/integrations/integration-service";
import {
  ensureFolderPath as ensureSharePointFolderPath,
  resolveAndDownloadFile as resolveAndDownloadSharePointFile,
  resolveDefaultDriveId,
  resolveSite,
  uploadOrReplaceFile as uploadOrReplaceSharePointFile,
} from "@/lib/integrations/sharepoint/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "populate_document_template";

const inputSchema = {
  provider: z.enum(["google-drive", "sharepoint"]),
  siteName: z
    .string()
    .optional()
    .describe("Required when provider is sharepoint."),
  templatePath: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Path (ending in the filename) to a .docx template with {field} placeholders, e.g. ["Templates", "quote-template.docx"]',
    ),
  outputPath: z
    .array(z.string().min(1))
    .min(1)
    .describe("Folder path to save the populated document into."),
  outputFilename: z.string().min(1),
  data: z
    .record(z.string(), z.unknown())
    .describe("Values for the template's {field} placeholders"),
  replace: z
    .boolean()
    .default(false)
    .describe(
      "Overwrite an existing same-named output file instead of duplicating it.",
    ),
};

const outputSchema = {
  fileId: z.string(),
};

function renderDocxTemplate(
  template: Buffer,
  data: Record<string, unknown>,
): Buffer {
  const zip = new PizZip(template);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * A business's quote template lives as a real .docx file in its own
 * connected storage, not something this app authors — docxtemplater's
 * default {tag} delimiter matches the same {field} convention already
 * used for template interpolation elsewhere in this pipeline family (see
 * entity-status-signal-pipeline.ts's interpolate helper), so a business
 * configuring a template and configuring an email subject/body template
 * both use the same, single syntax. Not approval-gated: producing a
 * document isn't itself customer-visible until something (e.g. send_email)
 * actually sends it — same reasoning as create_storage_folder.
 */
export function createPopulateDocumentTemplateTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Fill a business's .docx quote template (with {field} placeholders) with real data and save the result to their connected storage.",
    inputSchema,
    outputSchema,
    handler: async ({
      provider,
      siteName,
      templatePath,
      outputPath,
      outputFilename,
      data,
      replace,
    }: {
      provider: "google-drive" | "sharepoint";
      siteName?: string;
      templatePath: string[];
      outputPath: string[];
      outputFilename: string;
      data: Record<string, unknown>;
      replace: boolean;
    }) => {
      try {
        if (provider === "google-drive") {
          const accessToken =
            await getValidGoogleDriveAccessToken(organisationId);
          const template = await resolveAndDownloadDriveFile(
            accessToken,
            templatePath,
          );
          const populated = renderDocxTemplate(template, data);
          const folderId = await ensureDriveFolderPath(accessToken, outputPath);
          const file = await uploadOrReplaceDriveFile(
            accessToken,
            folderId,
            outputFilename,
            DOCX_MIME_TYPE,
            populated,
            replace,
          );
          return toolSuccess({ fileId: file.id });
        }

        if (!siteName) {
          return toolError("siteName is required when provider is sharepoint.");
        }
        const accessToken = await getValidSharePointAccessToken(organisationId);
        const site = await resolveSite(accessToken, siteName);
        if (!site) {
          return toolError(
            `No SharePoint site matching "${siteName}" was found.`,
          );
        }
        const driveId = await resolveDefaultDriveId(accessToken, site.id);
        const template = await resolveAndDownloadSharePointFile(
          accessToken,
          driveId,
          templatePath,
        );
        const populated = renderDocxTemplate(template, data);
        const folderId = await ensureSharePointFolderPath(
          accessToken,
          driveId,
          outputPath,
        );
        const file = await uploadOrReplaceSharePointFile(
          accessToken,
          driveId,
          folderId,
          outputFilename,
          DOCX_MIME_TYPE,
          populated,
          replace,
        );
        return toolSuccess({ fileId: file.id });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to populate the document template.";
        return toolError(message);
      }
    },
  };
}
