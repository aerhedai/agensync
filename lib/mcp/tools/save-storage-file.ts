import { z } from "zod";

import {
  ensureFolderPath as ensureDriveFolderPath,
  uploadOrReplaceFile as uploadOrReplaceDriveFile,
} from "@/lib/integrations/google-drive/client";
import {
  getValidGoogleDriveAccessToken,
  getValidSharePointAccessToken,
} from "@/lib/integrations/integration-service";
import {
  ensureFolderPath as ensureSharePointFolderPath,
  resolveDefaultDriveId,
  resolveSite,
  uploadOrReplaceFile as uploadOrReplaceSharePointFile,
} from "@/lib/integrations/sharepoint/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "save_storage_file";

const inputSchema = {
  provider: z.enum(["google-drive", "sharepoint"]),
  siteName: z
    .string()
    .optional()
    .describe("Required when provider is sharepoint — the site to resolve."),
  path: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Folder path segments (not including the filename), e.g. ["1042"]',
    ),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
  // true: overwrite any existing file of this exact name in this folder
  // rather than creating a second one — e.g. "keep only the latest
  // correspondence." false (default): always create a new file, the right
  // choice for attachments, which should accumulate.
  replace: z.boolean().default(false),
};

const outputSchema = {
  fileId: z.string(),
};

/**
 * The write counterpart to create_storage_folder for file *content*
 * specifically. Ensures the folder path exists itself (same find-or-create
 * semantics), so this is usable on its own, not only after a separate
 * create_storage_folder call. Not approval-gated — same class as
 * create_storage_folder and the custom-entity write tools.
 */
export function createSaveStorageFileTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Save a file into the business's connected Google Drive or SharePoint, creating the folder path if needed. Set replace to overwrite an existing same-named file instead of creating a duplicate.",
    inputSchema,
    outputSchema,
    handler: async ({
      provider,
      siteName,
      path,
      filename,
      mimeType,
      contentBase64,
      replace,
    }: {
      provider: "google-drive" | "sharepoint";
      siteName?: string;
      path: string[];
      filename: string;
      mimeType: string;
      contentBase64: string;
      replace: boolean;
    }) => {
      try {
        const content = Buffer.from(contentBase64, "base64");

        if (provider === "google-drive") {
          const accessToken =
            await getValidGoogleDriveAccessToken(organisationId);
          const folderId = await ensureDriveFolderPath(accessToken, path);
          const file = await uploadOrReplaceDriveFile(
            accessToken,
            folderId,
            filename,
            mimeType,
            content,
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
        const folderId = await ensureSharePointFolderPath(
          accessToken,
          driveId,
          path,
        );
        const file = await uploadOrReplaceSharePointFile(
          accessToken,
          driveId,
          folderId,
          filename,
          mimeType,
          content,
          replace,
        );
        return toolSuccess({ fileId: file.id });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save the file.";
        return toolError(message);
      }
    },
  };
}
