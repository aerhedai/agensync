const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

async function driveFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google Drive API request to ${path} failed (${response.status}): ${body}`,
    );
  }
  return response;
}

// Drive's query language treats ' as the string delimiter — a folder name
// containing one (e.g. a client's "O'Brien Ltd") would otherwise break the
// query or, worse, let it be reinterpreted.
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${escapeDriveQueryValue(name)}'`,
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    "trashed=false",
  ].join(" and ");
  const params = new URLSearchParams({ q, fields: "files(id)", pageSize: "1" });
  const response = await driveFetch(accessToken, `/files?${params.toString()}`);
  const data = (await response.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

async function createFolder(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<string> {
  const response = await driveFetch(accessToken, "/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const data = (await response.json()) as { id: string };
  return data.id;
}

// Same-name-reuses semantics, not per-call: two runs archiving into
// "Client Correspondence" under the same parent land in the same folder,
// never create a duplicate.
export async function resolveOrCreateFolder(
  accessToken: string,
  name: string,
  parentId = "root",
): Promise<string> {
  const existing = await findFolder(accessToken, name, parentId);
  if (existing) return existing;
  return createFolder(accessToken, name, parentId);
}

// Walks a path of folder names top to bottom, creating whichever segments
// don't already exist, and returns the deepest folder's id — e.g.
// ["Customer ABC", "Client correspondence"] resolves/creates a
// "Customer ABC" folder under Drive root, then a "Client correspondence"
// folder inside it.
export async function ensureFolderPath(
  accessToken: string,
  segments: string[],
): Promise<string> {
  let parentId = "root";
  for (const segment of segments) {
    parentId = await resolveOrCreateFolder(accessToken, segment, parentId);
  }
  return parentId;
}

async function findFile(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q = [
    "mimeType!='application/vnd.google-apps.folder'",
    `name='${escapeDriveQueryValue(name)}'`,
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    "trashed=false",
  ].join(" and ");
  const params = new URLSearchParams({ q, fields: "files(id)", pageSize: "1" });
  const response = await driveFetch(accessToken, `/files?${params.toString()}`);
  const data = (await response.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function downloadFile(
  accessToken: string,
  fileId: string,
): Promise<Buffer> {
  const response = await driveFetch(accessToken, `/files/${fileId}?alt=media`);
  return Buffer.from(await response.arrayBuffer());
}

// Walks folders only (never creates any) then finds a file by name inside
// the deepest one — for reading something a human is expected to have
// already placed there (e.g. a quote template), where silently creating
// missing folders would hide a real "wrong path" mistake instead of
// surfacing it as a clear error.
export async function resolveAndDownloadFile(
  accessToken: string,
  pathSegments: string[],
): Promise<Buffer> {
  if (pathSegments.length === 0) {
    throw new Error("A file path needs at least a filename.");
  }
  const folderSegments = pathSegments.slice(0, -1);
  const filename = pathSegments.at(-1) as string;

  let parentId = "root";
  for (const segment of folderSegments) {
    const found = await findFolder(accessToken, segment, parentId);
    if (!found) {
      throw new Error(
        `Folder "${segment}" was not found in "${pathSegments.join("/")}".`,
      );
    }
    parentId = found;
  }
  const fileId = await findFile(accessToken, filename, parentId);
  if (!fileId) {
    throw new Error(`File "${pathSegments.join("/")}" was not found.`);
  }
  return downloadFile(accessToken, fileId);
}

async function updateFileContent(
  accessToken: string,
  fileId: string,
  content: Buffer,
): Promise<{ id: string }> {
  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(content),
    },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Drive content update failed (${response.status}): ${errorBody}`,
    );
  }
  return response.json();
}

// Multipart upload (Drive API's simple path for files under ~5MB, which
// covers the email + PDF/photo attachments this is built for — a resumable
// upload session would be needed for anything larger, not implemented yet).
export async function uploadFile(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  content: Buffer,
): Promise<{ id: string }> {
  const boundary = `agensync-${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Drive upload failed (${response.status}): ${errorBody}`,
    );
  }
  return response.json();
}

// replace=true overwrites an existing same-named file's content in place
// (e.g. "keep only the latest correspondence") instead of creating a
// second file with the same name, which Drive otherwise allows.
export async function uploadOrReplaceFile(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  content: Buffer,
  replace = false,
): Promise<{ id: string }> {
  if (replace) {
    const existing = await findFile(accessToken, filename, folderId);
    if (existing) {
      return updateFileContent(accessToken, existing, content);
    }
  }
  return uploadFile(accessToken, folderId, filename, mimeType, content);
}
