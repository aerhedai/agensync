import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadFile,
  ensureFolderPath,
  resolveAndDownloadFile,
  resolveOrCreateFolder,
  uploadFile,
  uploadOrReplaceFile,
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

describe("downloadFile", () => {
  it("fetches the file's raw media content into a Buffer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/files/file-1?alt=media");
      return new Response("file bytes", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = await downloadFile("token", "file-1");

    expect(content.toString("utf-8")).toBe("file bytes");
  });
});

describe("resolveAndDownloadFile", () => {
  it("walks the folder path then downloads the file at the end of it", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      if (decoded.includes("alt=media")) {
        return new Response("template bytes", { status: 200 });
      }
      if (decoded.includes("mimeType!=")) {
        return new Response(JSON.stringify({ files: [{ id: "file-1" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ files: [{ id: "folder-1" }] }), {
        status: 200,
      });
    });

    const content = await resolveAndDownloadFile("token", [
      "Job 123",
      "Quotation",
      "quote-template.docx",
    ]);

    expect(content.toString("utf-8")).toBe("template bytes");
  });

  it("throws a clear error when a folder segment doesn't exist, without trying to create it", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ files: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveAndDownloadFile("token", ["Missing Folder", "file.docx"]),
    ).rejects.toThrow(/Folder "Missing Folder" was not found/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the file itself doesn't exist in an otherwise valid folder", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      if (decoded.includes("mimeType!=")) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ files: [{ id: "folder-1" }] }), {
        status: 200,
      });
    });

    await expect(
      resolveAndDownloadFile("token", ["Job 123", "missing.docx"]),
    ).rejects.toThrow(/File "Job 123\/missing\.docx" was not found/);
  });
});

describe("uploadOrReplaceFile", () => {
  it("creates a new file when replace is false, without checking for an existing one", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("uploadType=multipart");
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({ id: "new-file" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadOrReplaceFile(
      "token",
      "folder-1",
      "correspondence.txt",
      "text/plain",
      Buffer.from("hello"),
      false,
    );

    expect(result.id).toBe("new-file");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updates an existing same-named file's content in place when replace is true", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(method);
      if (method === "GET") {
        return new Response(
          JSON.stringify({ files: [{ id: "existing-file" }] }),
          { status: 200 },
        );
      }
      expect(url).toContain("/files/existing-file?uploadType=media");
      expect(method).toBe("PATCH");
      return new Response(JSON.stringify({ id: "existing-file" }), {
        status: 200,
      });
    });

    const result = await uploadOrReplaceFile(
      "token",
      "folder-1",
      "correspondence.txt",
      "text/plain",
      Buffer.from("updated"),
      true,
    );

    expect(result.id).toBe("existing-file");
    expect(calls).toEqual(["GET", "PATCH"]);
  });

  it("falls back to creating a new file when replace is true but none exists yet", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(method);
      if (method === "GET") {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "new-file" }), { status: 200 });
    });

    const result = await uploadOrReplaceFile(
      "token",
      "folder-1",
      "correspondence.txt",
      "text/plain",
      Buffer.from("first"),
      true,
    );

    expect(result.id).toBe("new-file");
    expect(calls).toEqual(["GET", "POST"]);
  });
});
