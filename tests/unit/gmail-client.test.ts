import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GMAIL_INBOX_LABEL,
  getGmailAttachmentContent,
  getGmailMessage,
  listUnreadInboxMessages,
  sendGmailMessage,
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

describe("getGmailMessage attachments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects attachment refs (filename + attachmentId) from nested payload parts, not the body text part", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "msg-1",
            payload: {
              headers: [
                { name: "From", value: "buyer@customer-abc.test" },
                { name: "Subject", value: "Quote request" },
              ],
              mimeType: "multipart/mixed",
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: Buffer.from("hello").toString("base64url") },
                },
                {
                  mimeType: "application/pdf",
                  filename: "drawing.pdf",
                  body: { attachmentId: "att-1", size: 1234 },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const message = await getGmailMessage("token", "msg-1");

    expect(message.body).toBe("hello");
    expect(message.attachments).toEqual([
      {
        filename: "drawing.pdf",
        mimeType: "application/pdf",
        attachmentId: "att-1",
        size: 1234,
      },
    ]);
  });
});

describe("getGmailAttachmentContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes the attachment's base64url content into a Buffer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/messages/msg-1/attachments/att-1");
      return new Response(
        JSON.stringify({
          data: Buffer.from("pdf bytes").toString("base64url"),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = await getGmailAttachmentContent("token", "msg-1", "att-1");

    expect(content.toString("utf-8")).toBe("pdf bytes");
  });
});

describe("sendGmailMessage with attachments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a multipart/mixed MIME message including each attachment part", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { raw: string };
      const decoded = Buffer.from(body.raw, "base64url").toString("utf-8");
      expect(decoded).toContain("Content-Type: multipart/mixed");
      expect(decoded).toContain('filename="drawing.pdf"');
      expect(decoded).toContain(Buffer.from("pdf bytes").toString("base64"));
      return new Response(JSON.stringify({ id: "sent-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendGmailMessage("token", {
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

  it("falls back to a plain single-part message when there are no attachments", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { raw: string };
      const decoded = Buffer.from(body.raw, "base64url").toString("utf-8");
      expect(decoded).not.toContain("multipart/mixed");
      expect(decoded).toContain("Please find attached.");
      return new Response(JSON.stringify({ id: "sent-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendGmailMessage("token", {
      to: "buyer@customer-abc.test",
      subject: "Your quote",
      body: "Please find attached.",
    });
  });
});
