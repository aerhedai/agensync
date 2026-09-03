import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OUTLOOK_INBOX_FOLDER,
  listOutlookAttachments,
  listUnreadOutlookMessages,
  sendOutlookMessage,
} from "@/lib/integrations/outlook/client";

// Regression test mirroring the Gmail label-scoping one (CLAUDE.md #14):
// unread messages must only ever be queried from the dedicated Aperator
// folder, never the whole mailbox — locks in the same deterministic scope
// boundary Outlook's client is meant to enforce.
describe("listUnreadOutlookMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the Aperator folder id first, then scopes the unread query to it", async () => {
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

describe("listOutlookAttachments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only fileAttachments with contentBytes and decodes them into Buffers", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/messages/msg-1/attachments");
      return new Response(
        JSON.stringify({
          value: [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: "drawing.pdf",
              contentType: "application/pdf",
              contentBytes: Buffer.from("pdf bytes").toString("base64"),
            },
            {
              "@odata.type": "#microsoft.graph.itemAttachment",
              name: "forwarded-email.eml",
              contentType: "message/rfc822",
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const attachments = await listOutlookAttachments("token", "msg-1");

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.filename).toBe("drawing.pdf");
    expect(attachments[0]?.mimeType).toBe("application/pdf");
    expect(attachments[0]?.content.toString("utf-8")).toBe("pdf bytes");
  });
});

describe("sendOutlookMessage with attachments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes each attachment as a fileAttachment with base64 contentBytes in the request body", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        message: {
          attachments?: {
            "@odata.type": string;
            name: string;
            contentType: string;
            contentBytes: string;
          }[];
        };
      };
      expect(body.message.attachments).toEqual([
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "drawing.pdf",
          contentType: "application/pdf",
          contentBytes: Buffer.from("pdf bytes").toString("base64"),
        },
      ]);
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendOutlookMessage("token", {
      to: "buyer@customer-abc.test",
      subject: "Your quote",
      body: "Please find attached.",
      attachments: [
        {
          filename: "drawing.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("pdf bytes"),
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits the attachments field when none are given", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        message: { attachments?: unknown };
      };
      expect(body.message.attachments).toBeUndefined();
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendOutlookMessage("token", {
      to: "buyer@customer-abc.test",
      subject: "Your quote",
      body: "Please find attached.",
    });
  });
});
