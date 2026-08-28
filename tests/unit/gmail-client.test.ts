import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GMAIL_INBOX_LABEL,
  listUnreadInboxMessages,
} from "@/lib/integrations/gmail/client";

// Regression test for the Phase 9 live-testing incident: an unscoped
// "is:unread in:inbox" query processed 10 real personal emails instead of
// just the one intended test message. The label is the deterministic scope
// boundary (CLAUDE.md #14) — this locks in that "Check inbox" can never
// silently widen back out to the whole inbox.
describe("listUnreadInboxMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries only mail labelled with the Agensync inbox label, not the whole inbox", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "msg-1" }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listUnreadInboxMessages("token-123");

    expect(result).toEqual([{ id: "msg-1" }]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    const requestedQuery = new URL(url).searchParams.get("q");
    expect(requestedQuery).toBe(`label:${GMAIL_INBOX_LABEL} is:unread`);
    expect(requestedQuery).not.toContain("in:inbox");
  });
});
