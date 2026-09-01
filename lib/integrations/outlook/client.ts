const GRAPH_ME_BASE = "https://graph.microsoft.com/v1.0/me";

// The deterministic scope boundary for inbox ingestion — same reasoning as
// Gmail's GMAIL_INBOX_LABEL (CLAUDE.md #14): only mail the business has
// routed here via a one-time Outlook rule that moves matching mail into
// this folder is ever read or processed. Outlook has no direct label
// equivalent; a folder is the closest analogue since Outlook rules move
// mail into folders as their primary automation mechanism.
export const OUTLOOK_INBOX_FOLDER = "Agensync";

async function graphFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${GRAPH_ME_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Microsoft Graph request to ${path} failed (${response.status}): ${body}`,
    );
  }
  return response;
}

// Resolved fresh on every call rather than cached — this is an on-demand
// action (CLAUDE.md #30, no background worker), not a hot path, and
// avoids a stale-id edge case if the business ever recreates the folder.
async function resolveInboxFolderId(accessToken: string): Promise<string> {
  const params = new URLSearchParams({
    $filter: `displayName eq '${OUTLOOK_INBOX_FOLDER}'`,
  });
  const response = await graphFetch(
    accessToken,
    `/mailFolders?${params.toString()}`,
  );
  const data = (await response.json()) as { value: { id: string }[] };
  const folder = data.value[0];
  if (!folder) {
    throw new Error(
      `No Outlook folder named "${OUTLOOK_INBOX_FOLDER}" was found — create it and a rule that moves matching mail into it (see Settings).`,
    );
  }
  return folder.id;
}

export interface OutlookMessageSummary {
  id: string;
}

export async function listUnreadOutlookMessages(
  accessToken: string,
  maxResults = 10,
): Promise<OutlookMessageSummary[]> {
  const folderId = await resolveInboxFolderId(accessToken);
  const params = new URLSearchParams({
    $filter: "isRead eq false",
    $select: "id",
    $top: String(maxResults),
  });
  const response = await graphFetch(
    accessToken,
    `/mailFolders/${folderId}/messages?${params.toString()}`,
  );
  const data = (await response.json()) as { value: OutlookMessageSummary[] };
  return data.value;
}

interface GraphMessage {
  id: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  subject?: string;
  body?: { content?: string };
}

export interface OutlookMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
}

export async function getOutlookMessage(
  accessToken: string,
  messageId: string,
): Promise<OutlookMessage> {
  const params = new URLSearchParams({ $select: "from,subject,body" });
  const response = await graphFetch(
    accessToken,
    `/messages/${messageId}?${params.toString()}`,
    // Graph returns HTML by default — plain text avoids needing an
    // HTML-stripping step, matching Gmail's plain-text extraction.
    { headers: { Prefer: 'outlook.body-content-type="text"' } },
  );
  const data = (await response.json()) as GraphMessage;

  const fromAddress = data.from?.emailAddress;
  return {
    id: data.id,
    // "Name <addr>" — matches Gmail's raw "From" header shape so this
    // reads consistently, even though extractEmailDeterministically is a
    // plain regex match and doesn't actually require this exact format.
    from: fromAddress?.address
      ? `${fromAddress.name ?? ""} <${fromAddress.address}>`
      : "",
    subject: data.subject ?? "",
    body: (data.body?.content ?? "").trim(),
  };
}

export async function markOutlookMessageRead(
  accessToken: string,
  messageId: string,
): Promise<void> {
  await graphFetch(accessToken, `/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRead: true }),
  });
}

export async function sendOutlookMessage(
  accessToken: string,
  params: { to: string; subject: string; body: string },
): Promise<void> {
  await graphFetch(accessToken, "/sendMail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: "Text", content: params.body },
        toRecipients: [{ emailAddress: { address: params.to } }],
      },
    }),
  });
}
