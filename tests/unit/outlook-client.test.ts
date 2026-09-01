import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OUTLOOK_INBOX_FOLDER,
  listUnreadOutlookMessages,
} from "@/lib/integrations/outlook/client";

// Regression test mirroring the Gmail label-scoping one (CLAUDE.md #14):
// unread messages must only ever be queried from the dedicated Agensync
// folder, never the whole mailbox — locks in the same deterministic scope
// boundary Outlook's client is meant to enforce.
describe("listUnreadOutlookMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the Agensync folder id first, then scopes the unread query to it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/mailFolders?")) {
        return new Response(JSON.stringify({ value: [{ id: "folder-123" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ value: [{ id: "msg-1" }] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listUnreadOutlookMessages("token-123");

    expect(result).toEqual([{ id: "msg-1" }]);

    const [folderCallUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(folderCallUrl).searchParams.get("$filter")).toBe(
      `displayName eq '${OUTLOOK_INBOX_FOLDER}'`,
    );

    const [messagesCallUrl] = fetchMock.mock.calls[1] as unknown as [string];
    expect(messagesCallUrl).toContain("/mailFolders/folder-123/messages");
    expect(new URL(messagesCallUrl).searchParams.get("$filter")).toBe(
      "isRead eq false",
    );
  });

  it("throws a clear setup-required error when the folder doesn't exist", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listUnreadOutlookMessages("token-123")).rejects.toThrow(
      /No Outlook folder named/,
    );
  });
});
