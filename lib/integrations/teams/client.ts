const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function sendTeamsChannelMessage(
  accessToken: string,
  params: { teamId: string; channelId: string; text: string },
): Promise<void> {
  const response = await fetch(
    `${GRAPH_BASE}/teams/${params.teamId}/channels/${params.channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: { content: params.text } }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Microsoft Teams channel message request failed (${response.status}): ${body}`,
    );
  }
}
