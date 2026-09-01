const SLACK_API_BASE = "https://slack.com/api";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

export async function postSlackMessage(
  botToken: string,
  params: { channel: string; text: string },
): Promise<void> {
  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(params),
  });
  // Same divergence from Gmail's client as the OAuth exchange: Slack
  // returns HTTP 200 even on failure, so success is the JSON `ok` field,
  // not response.ok.
  const data = (await response.json()) as SlackApiResponse;
  if (!data.ok) {
    throw new Error(
      `Slack chat.postMessage failed: ${data.error ?? "unknown error"}`,
    );
  }
}
