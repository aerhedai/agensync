import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureFolderPath,
  resolveDefaultDriveId,
  resolveOrCreateFolder,
  resolveSite,
  uploadFile,
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
