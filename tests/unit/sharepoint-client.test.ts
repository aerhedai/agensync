import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadFileContent,
  ensureFolderPath,
  resolveAndDownloadFile,
  resolveDefaultDriveId,
  resolveOrCreateFolder,
  resolveSite,
  uploadFile,
  uploadOrReplaceFile,
} from "@/lib/integrations/sharepoint/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveSite", () => {
  it("returns the first matching site", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/sites?search=");
      return new Response(
        JSON.stringify({
          value: [{ id: "site-1", displayName: "FSWD Quotes" }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const site = await resolveSite("token", "FSWD Quotes");

    expect(site).toEqual({ id: "site-1", name: "FSWD Quotes" });
  });

  it("returns null when nothing matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ value: [] }), { status: 200 }),
      ),
    );

    const site = await resolveSite("token", "Nonexistent");

    expect(site).toBeNull();
  });
});

describe("resolveDefaultDriveId", () => {
  it("resolves the site's default document library id", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/sites/site-1/drive");
      return new Response(JSON.stringify({ id: "drive-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const driveId = await resolveDefaultDriveId("token", "site-1");

    expect(driveId).toBe("drive-1");
  });
});

describe("resolveOrCreateFolder", () => {
  it("reuses an existing folder rather than creating a duplicate", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            value: [
              { id: "existing-id", name: "Client correspondence", folder: {} },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const folderId = await resolveOrCreateFolder(
      "token",
      "drive-1",
      "Client correspondence",
    );

    expect(folderId).toBe("existing-id");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a same-named file when only a folder should match", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      if (!init?.method) {
        // A file happens to share the folder's name — must not be treated
        // as the folder.
        return new Response(
          JSON.stringify({ value: [{ id: "file-id", name: "Orders" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: "new-folder-id" }), {
        status: 200,
      });
    });

    const folderId = await resolveOrCreateFolder("token", "drive-1", "Orders");

    expect(calls).toEqual(["GET", "POST"]);
    expect(folderId).toBe("new-folder-id");
  });

  it("escapes an embedded single quote by doubling it (OData syntax)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      expect(decoded).toContain("name eq 'O''Brien Ltd'");
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      }
      return fetchMock(url);
    });

    await resolveOrCreateFolder("token", "drive-1", "O'Brien Ltd");
  });
});

describe("ensureFolderPath", () => {
  it("walks each segment under the previous result, starting at root", async () => {
    const seenParents: string[] = [];
    let call = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      call += 1;
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: `folder-${call}` }), {
          status: 200,
        });
      }
      const match = url.match(/items\/([^/]+)\/children/);
      if (match?.[1]) seenParents.push(match[1]);
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });

    const folderId = await ensureFolderPath("token", "drive-1", [
      "Customer ABC",
      "Client correspondence",
    ]);

    expect(seenParents[0]).toBe("root");
    expect(folderId).toBeTruthy();
  });
});

describe("uploadFile", () => {
  it("PUTs content to the folder-relative path with the given content type", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain(
        "/drives/drive-1/items/folder-1:/quote.pdf:/content",
      );
      expect(init?.method).toBe("PUT");
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/pdf",
      );
      return new Response(JSON.stringify({ id: "file-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadFile(
      "token",
      "drive-1",
      "folder-1",
      "quote.pdf",
      "application/pdf",
      Buffer.from("fake pdf bytes"),
    );

    expect(result.id).toBe("file-1");
  });
});

describe("downloadFileContent", () => {
  it("fetches the item's raw content into a Buffer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/drives/drive-1/items/file-1/content");
      return new Response("file bytes", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = await downloadFileContent("token", "drive-1", "file-1");

    expect(content.toString("utf-8")).toBe("file bytes");
  });
});

describe("uploadOrReplaceFile", () => {
  it("always PUTs to the same path-addressed endpoint regardless of the replace flag (a documented no-op)", async () => {
    const calls: boolean[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(true);
      expect(url).toContain(
        "/drives/drive-1/items/folder-1:/quote.pdf:/content",
      );
      expect(init?.method).toBe("PUT");
      return new Response(JSON.stringify({ id: "file-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const withoutReplace = await uploadOrReplaceFile(
      "token",
      "drive-1",
      "folder-1",
      "quote.pdf",
      "application/pdf",
      Buffer.from("v1"),
      false,
    );
    const withReplace = await uploadOrReplaceFile(
      "token",
      "drive-1",
      "folder-1",
      "quote.pdf",
      "application/pdf",
      Buffer.from("v2"),
      true,
    );

    expect(withoutReplace.id).toBe("file-1");
    expect(withReplace.id).toBe("file-1");
    expect(calls).toHaveLength(2);
  });
});

describe("resolveAndDownloadFile", () => {
  it("walks the folder path then downloads the file at the end of it", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/content")) {
        return new Response("template bytes", { status: 200 });
      }
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      if (decoded.includes("name eq 'quote-template.docx'")) {
        return new Response(
          JSON.stringify({
            value: [{ id: "file-1", name: "quote-template.docx" }],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ value: [{ id: "folder-1", name: "x", folder: {} }] }),
        { status: 200 },
      );
    });

    const content = await resolveAndDownloadFile("token", "drive-1", [
      "Job 123",
      "Quotation",
      "quote-template.docx",
    ]);

    expect(content.toString("utf-8")).toBe("template bytes");
  });

  it("throws a clear error when a folder segment doesn't exist, without trying to create it", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveAndDownloadFile("token", "drive-1", [
        "Missing Folder",
        "file.docx",
      ]),
    ).rejects.toThrow(/Folder "Missing Folder" was not found/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the file itself doesn't exist in an otherwise valid folder", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const decoded = decodeURIComponent(url).replace(/\+/g, " ");
      if (decoded.includes("name eq 'missing.docx'")) {
        return new Response(JSON.stringify({ value: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ value: [{ id: "folder-1", name: "x", folder: {} }] }),
        { status: 200 },
      );
    });

    await expect(
      resolveAndDownloadFile("token", "drive-1", ["Job 123", "missing.docx"]),
    ).rejects.toThrow(/File "Job 123\/missing\.docx" was not found/);
  });
});
