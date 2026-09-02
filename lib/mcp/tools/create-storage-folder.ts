import { z } from "zod";

import { ensureFolderPath as ensureDriveFolderPath } from "@/lib/integrations/google-drive/client";
import {
  getValidGoogleDriveAccessToken,
  getValidSharePointAccessToken,
} from "@/lib/integrations/integration-service";
import {
  ensureFolderPath as ensureSharePointFolderPath,
  resolveDefaultDriveId,
  resolveSite,
} from "@/lib/integrations/sharepoint/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "create_storage_folder";

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
      'Folder path segments, top to bottom, e.g. ["1042", "Client correspondence"]',
    ),
};

const outputSchema = {
  folderId: z.string(),
};

/**
 * One tool covering both storage providers rather than two near-identical
 * ones — a business's pipeline config picks which provider by name, same
 * as everywhere else a provider is a string, not a fixed integration. Not
 * approval-gated: creating a folder is not itself customer-visible or
 * consequential the way send_email/create_calendar_event are (see
 * policy-engine.ts) — same class as the custom-entity write tools.
 */
export function createCreateStorageFolderTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Create (or reuse, if it already exists) a nested folder path in the business's connected Google Drive or SharePoint.",
    inputSchema,
    outputSchema,
    handler: async ({
      provider,
      siteName,
      path,
    }: {
      provider: "google-drive" | "sharepoint";
      siteName?: string;
      path: string[];
    }) => {
      try {
        if (provider === "google-drive") {
          const accessToken =
            await getValidGoogleDriveAccessToken(organisationId);
          const folderId = await ensureDriveFolderPath(accessToken, path);
          return toolSuccess({ folderId });
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
        return toolSuccess({ folderId });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to create storage folder.";
        return toolError(message);
      }
    },
  };
}
