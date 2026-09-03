import { z } from "zod";

import { sendGmailMessage } from "@/lib/integrations/gmail/client";
import { resolveAndDownloadFile as resolveAndDownloadDriveFile } from "@/lib/integrations/google-drive/client";
import {
  getValidEmailAccessToken,
  getValidGoogleDriveAccessToken,
  getValidSharePointAccessToken,
} from "@/lib/integrations/integration-service";
import { sendOutlookMessage } from "@/lib/integrations/outlook/client";
import {
  resolveAndDownloadFile as resolveAndDownloadSharePointFile,
  resolveDefaultDriveId,
  resolveSite,
} from "@/lib/integrations/sharepoint/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";

const attachmentRefSchema = z.object({
  provider: z.enum(["google-drive", "sharepoint"]),
  siteName: z
    .string()
    .optional()
    .describe("Required when provider is sharepoint."),
  path: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Folder path segments ending in the filename, e.g. ["1042", "Quotation", "quote-final.pdf"]',
    ),
  mimeType: z.string().min(1),
});

const inputSchema = {
  to: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  attachments: z
    .array(attachmentRefSchema)
    .optional()
    .describe(
      "Files already saved in the business's connected storage to attach — not raw content.",
    ),
};

const outputSchema = {
  sent: z.boolean(),
};

async function resolveAttachment(
  organisationId: string,
  ref: z.infer<typeof attachmentRefSchema>,
): Promise<{ filename: string; mimeType: string; content: Buffer }> {
  const filename = ref.path.at(-1) as string;
  if (ref.provider === "google-drive") {
    const accessToken = await getValidGoogleDriveAccessToken(organisationId);
    const content = await resolveAndDownloadDriveFile(accessToken, ref.path);
    return { filename, mimeType: ref.mimeType, content };
  }
  if (!ref.siteName) {
    throw new Error(
      "siteName is required when an attachment's provider is sharepoint.",
    );
  }
  const accessToken = await getValidSharePointAccessToken(organisationId);
  const site = await resolveSite(accessToken, ref.siteName);
  if (!site) {
    throw new Error(`No SharePoint site matching "${ref.siteName}" was found.`);
  }
  const driveId = await resolveDefaultDriveId(accessToken, site.id);
  const content = await resolveAndDownloadSharePointFile(
    accessToken,
    driveId,
    ref.path,
  );
  return { filename, mimeType: ref.mimeType, content };
}

/**
 * organisationId (and actionIntegrationId) are bound at server-construction
 * time (see lib/mcp/server.ts), never taken as a tool argument — the LLM
 * must never be able to supply which organisation's or which account's
 * credentials to use (CLAUDE.md #22), so this closes over the
 * caller-supplied values instead. actionIntegrationId null/undefined means
 * "the organisation's default email account" — see
 * getValidEmailAccessToken's own doc comment. Provider-agnostic across
 * Gmail and Outlook Mail: "send an email reply" is one concept to an agent
 * regardless of which one backs it, so this resolves whichever is actually
 * connected (or pinned) rather than assuming Gmail.
 *
 * Attachments are references to files already saved in connected storage,
 * not raw bytes passed as a tool argument — nothing generating a tool call
 * (model or pipeline) can conjure real file content out of nothing; it can
 * only point at something that already exists (e.g. what
 * save_file/create_folder produced earlier in the same
 * pipeline).
 */
export function createSendEmailTool(
  organisationId: string,
  actionIntegrationId?: string | null,
) {
  return {
    name: "send_email",
    description:
      "Send an email reply to a customer, e.g. with a finished quote and its attachments.",
    inputSchema,
    outputSchema,
    handler: async ({
      to,
      subject,
      body,
      attachments,
    }: {
      to: string;
      subject: string;
      body: string;
      attachments?: z.infer<typeof attachmentRefSchema>[];
    }) => {
      try {
        const resolvedAttachments = attachments
          ? await Promise.all(
              attachments.map((ref) => resolveAttachment(organisationId, ref)),
            )
          : undefined;

        const { provider, accessToken } = await getValidEmailAccessToken(
          organisationId,
          actionIntegrationId,
        );
        if (provider === "gmail") {
          await sendGmailMessage(accessToken, {
            to,
            subject,
            body,
            attachments: resolvedAttachments,
          });
        } else {
          await sendOutlookMessage(accessToken, {
            to,
            subject,
            body,
            attachments: resolvedAttachments,
          });
        }
        return toolSuccess({ sent: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send email.";
        return toolError(message);
      }
    },
  };
}
