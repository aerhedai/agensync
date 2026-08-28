const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// The deterministic scope boundary for inbox ingestion: only mail the
// business has already routed here (via a one-time Gmail filter on a
// dedicated address, e.g. quotes@company.com) is ever read or processed.
// Deliberately not scoped further by subject/keyword — within this label,
// the agent decides what each email is actually asking for. Without this
// boundary, "Check inbox" would scan the whole real inbox, which is what
// happened during Phase 9 live testing: it processed 10 unrelated personal
// emails (newsletters, security alerts) instead of just the one test quote
// request. See CLAUDE.md #14: scope/permission boundaries are deterministic
// application logic, not something left to the LLM's judgement.
export const GMAIL_INBOX_LABEL = "Agensync";

async function gmailFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gmail API request to ${path} failed (${response.status}): ${body}`,
    );
  }
  return response;
}

export async function getGmailProfile(
  accessToken: string,
): Promise<{ emailAddress: string }> {
  const response = await gmailFetch(accessToken, "/profile");
  return response.json();
}

export interface GmailMessageSummary {
  id: string;
}

export async function listUnreadInboxMessages(
  accessToken: string,
  maxResults = 10,
): Promise<GmailMessageSummary[]> {
  const params = new URLSearchParams({
    q: `label:${GMAIL_INBOX_LABEL} is:unread`,
    maxResults: String(maxResults),
  });
  const response = await gmailFetch(
    accessToken,
    `/messages?${params.toString()}`,
  );
  const data = (await response.json()) as { messages?: GmailMessageSummary[] };
  return data.messages ?? [];
}

interface GmailPayloadPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractPlainTextBody(payload: GmailPayloadPart): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainTextBody(part);
    if (text) return text;
  }
  return "";
}

function headerValue(
  headers: { name: string; value: string }[],
  name: string,
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage> {
  const response = await gmailFetch(
    accessToken,
    `/messages/${messageId}?format=full`,
  );
  const data = (await response.json()) as {
    id: string;
    payload: GmailPayloadPart & { headers: { name: string; value: string }[] };
  };

  return {
    id: data.id,
    from: headerValue(data.payload.headers, "From"),
    subject: headerValue(data.payload.headers, "Subject"),
    body: extractPlainTextBody(data.payload).trim(),
  };
}

export async function markGmailMessageRead(
  accessToken: string,
  messageId: string,
): Promise<void> {
  await gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

function encodeMimeMessage(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const message = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.body,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export async function sendGmailMessage(
  accessToken: string,
  params: { to: string; subject: string; body: string },
): Promise<void> {
  await gmailFetch(accessToken, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeMimeMessage(params) }),
  });
}
