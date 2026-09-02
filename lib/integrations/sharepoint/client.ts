const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SharePoint Graph API request to ${path} failed (${response.status}): ${body}`,
    );
  }
  return response;
}

// OData string literals escape an embedded ' by doubling it, not by
// backslash-escaping the way Google Drive's query language does.
function escapeODataValue(value: string): string {
  return value.replace(/'/g, "''");
}

export interface SharePointSite {
  id: string;
  name: string;
}

// A business types a site name once (e.g. "Projects" or "FSWD Quotes") —
// same one-time-manual-lookup shape as Teams' team/channel id, rather than
// requesting an extra scope just to let a business browse every site it
// has access to.
export async function resolveSite(
  accessToken: string,
  siteName: string,
): Promise<SharePointSite | null> {
  const params = new URLSearchParams({ search: siteName });
  const response = await graphFetch(accessToken, `/sites?${params.toString()}`);
  const data = (await response.json()) as {
    value: { id: string; displayName: string }[];
  };
  const match = data.value[0];
  return match ? { id: match.id, name: match.displayName } : null;
}

// Every SharePoint site has exactly one default document library — the
// "drive" everything else here (folders, files) is addressed relative to.
export async function resolveDefaultDriveId(
  accessToken: string,
  siteId: string,
): Promise<string> {
  const response = await graphFetch(accessToken, `/sites/${siteId}/drive`);
  const data = (await response.json()) as { id: string };
  return data.id;
}

interface DriveChild {
  id: string;
  name: string;
  folder?: unknown;
}

async function findChildFolder(
  accessToken: string,
  driveId: string,
  parentItemId: string,
  name: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    $filter: `name eq '${escapeODataValue(name)}'`,
  });
  const response = await graphFetch(
    accessToken,
    `/drives/${driveId}/items/${parentItemId}/children?${params.toString()}`,
  );
  const data = (await response.json()) as { value: DriveChild[] };
  const match = data.value.find((child) => child.folder !== undefined);
  return match?.id ?? null;
}

async function createChildFolder(
  accessToken: string,
  driveId: string,
  parentItemId: string,
  name: string,
): Promise<string> {
  const response = await graphFetch(
    accessToken,
    `/drives/${driveId}/items/${parentItemId}/children`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    },
  );
  const data = (await response.json()) as { id: string };
  return data.id;
}

// Same-name-reuses semantics as Google Drive's resolveOrCreateFolder — two
// runs archiving into "Client correspondence" under the same parent land
// in the same folder, never create a duplicate.
export async function resolveOrCreateFolder(
  accessToken: string,
  driveId: string,
  name: string,
  parentItemId = "root",
): Promise<string> {
  const existing = await findChildFolder(
    accessToken,
    driveId,
    parentItemId,
    name,
  );
  if (existing) return existing;
  return createChildFolder(accessToken, driveId, parentItemId, name);
}

// Walks a path of folder names top to bottom under the given drive,
// creating whichever segments don't already exist, and returns the
// deepest folder's item id.
export async function ensureFolderPath(
  accessToken: string,
  driveId: string,
  segments: string[],
): Promise<string> {
  let parentItemId = "root";
  for (const segment of segments) {
    parentItemId = await resolveOrCreateFolder(
      accessToken,
      driveId,
      segment,
      parentItemId,
    );
  }
  return parentItemId;
}

// Graph's simple upload (PUT .../content) — fine for the email bodies and
// typical attachments this is built for; anything over ~4MB needs a
// resumable upload session instead, not implemented yet.
export async function uploadFile(
  accessToken: string,
  driveId: string,
  folderItemId: string,
  filename: string,
  mimeType: string,
  content: Buffer,
): Promise<{ id: string }> {
  const response = await graphFetch(
    accessToken,
    `/drives/${driveId}/items/${folderItemId}:/${encodeURIComponent(filename)}:/content`,
    {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      // A plain Uint8Array view, not the Buffer subclass directly — avoids
      // a structural type mismatch between @types/node's generic Buffer
      // and fetch's BodyInit; same bytes, zero-copy.
      body: new Uint8Array(content),
    },
  );
  return response.json();
}
