import { google } from "googleapis";
import { Readable } from "node:stream";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET")
  );

  client.setCredentials({ refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN") });

  return client;
}

export function getGoogleDriveClient() {
  console.log("Initializing Google Drive client", {
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
  });
  const auth = getOAuth2Client();
  return google.drive({ version: "v3", auth });
}

async function getGoogleAccessToken(): Promise<string> {
  const auth = getOAuth2Client();
  const tokenResult = await auth.getAccessToken();
  const token =
    typeof tokenResult === "string" ? tokenResult : tokenResult?.token ?? "";
  if (!token) {
    throw new Error("Failed to obtain Google OAuth access token.");
  }
  return token;
}

export async function createApplicationFolder(
  appNumber: string,
  customerName: string
): Promise<{ id: string; url: string }> {
  const drive = getGoogleDriveClient();
  const rootFolderId = requireEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");
  const folderName = `${appNumber} — ${customerName}`;

  try {
    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        parents: [rootFolderId],
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });

    const id = res.data.id;
    if (!id) throw new Error("Google Drive did not return a folder id.");

    return { id, url: `https://drive.google.com/drive/folders/${id}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to create application folder in Drive (name="${folderName}"): ${message}`
    );
  }
}

export async function uploadFileToDrive(
  file: Buffer | NodeJS.ReadableStream,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ id: string; url: string }> {
  const drive = getGoogleDriveClient();

  try {
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Buffer.isBuffer(file) ? Readable.from(file) : file,
      },
      fields: "id",
    });

    const id = res.data.id;
    if (!id) throw new Error("Google Drive did not return a file id.");

    try {
      await drive.permissions.create({
        fileId: id,
        requestBody: {
          type: "anyone",
          role: "reader",
        },
      });
    } catch (permErr) {
      const permMessage =
        permErr instanceof Error ? permErr.message : String(permErr);
      throw new Error(
        `Uploaded file but failed to set "anyone with link" permissions: ${permMessage}`
      );
    }

    return { id, url: `https://drive.google.com/file/d/${id}/view` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to upload file to Drive (fileName="${fileName}", folderId="${folderId}"): ${message}`
    );
  }
}

export async function createDriveResumableUploadSession(
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<string> {
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType || "application/octet-stream",
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create Drive resumable upload session (${res.status}): ${
        body || res.statusText
      }`
    );
  }

  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) {
    throw new Error("Drive resumable upload session did not return a Location header.");
  }
  return uploadUrl;
}

export async function setFilePublicReadable(fileId: string): Promise<void> {
  const drive = getGoogleDriveClient();
  await drive.permissions.create({
    fileId,
    requestBody: {
      type: "anyone",
      role: "reader",
    },
  });
}

export async function getFileAsBase64(fileId: string): Promise<string> {
  const drive = getGoogleDriveClient();

  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const data = res.data as ArrayBuffer;
    return Buffer.from(data).toString("base64");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to download Drive file as base64 (id="${fileId}"): ${message}`);
  }
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getGoogleDriveClient();

  try {
    await drive.files.delete({ fileId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to delete Drive file (id="${fileId}"): ${message}`);
  }
}

