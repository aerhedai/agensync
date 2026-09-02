import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureFolderPath,
  resolveOrCreateFolder,
  uploadFile,
} from "@/lib/integrations/google-drive/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveOrCreateFolder", () => {
  it("reuses an existing folder instead of creating a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/files?q=");
      return new Response(JSON.stringify({ files: [{ id: "existing-id" }] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const folderId = await resolveOrCreateFolder(
      "token",
      "Client Correspondence",
      "root",
    );

    expect(folderId).toBe("existing-id");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a new folder when none matches", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      if (!init?.method) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "new-id" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const folderId = await resolveOrCreateFolder("token", "New Client", "root");

    expect(folderId).toBe("new-id");
    expect(calls).toEqual(["GET", "POST"]);
  });

  it("escapes single quotes in folder names so a query can't be broken", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      expect(decoded).toContain("name='O\\'Brien Ltd'");
      return new Response(JSON.stringify({ files: [{ id: "x" }] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveOrCreateFolder("token", "O'Brien Ltd", "root");
  });
});

describe("ensureFolderPath", () => {
  it("walks each segment, nesting under the previous result", async () => {
    const seenParents: string[] = [];
    let call = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      call += 1;
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: `folder-${call}` }), {
          status: 200,
        });
      }
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      const match = decoded.match(/'([^']*)' in parents/);
      if (match?.[1]) seenParents.push(match[1]);
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });

    const folderId = await ensureFolderPath("token", [
      "Customer ABC",
      "Client correspondence",
    ]);

    expect(seenParents).toEqual(["root", "folder-2"]);
    expect(folderId).toBe("folder-4");
  });
});

describe("uploadFile", () => {
  it("uploads to the multipart endpoint with the correct folder as parent", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/upload/drive/v3/files?uploadType=multipart");
      expect(init?.method).toBe("POST");
      const bodyText = (init?.body as Buffer).toString("utf-8");
      expect(bodyText).toContain('"parents":["folder-1"]');
      expect(bodyText).toContain('"name":"quote.pdf"');
      return new Response(JSON.stringify({ id: "file-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadFile(
      "token",
      "folder-1",
      "quote.pdf",
      "application/pdf",
      Buffer.from("fake pdf bytes"),
    );

    expect(result.id).toBe("file-1");
  });
});
