import { NextResponse } from "next/server";

import { originalUploadDriveName } from "@/lib/drive-file-naming";
import {
  createApplicationFolder,
  createDriveResumableUploadSession,
} from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type SessionEntry = {
  uploadUrl: string;
  createdAt: number;
};

// Best-effort in-memory cache (may not persist across serverless invocations).
const UPLOAD_SESSIONS = new Map<string, SessionEntry>();

function getRangeForChunk(
  chunkIndex: number,
  chunkSize: number,
  totalSize: number,
  actualChunkBytes: number
): { start: number; end: number } {
  const start = chunkIndex * chunkSize;
  const end = start + actualChunkBytes - 1;
  if (start < 0 || end < start || end >= totalSize) {
    throw new Error("Invalid chunk range.");
  }
  return { start, end };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const application_id = String(form.get("application_id") ?? "").trim();
    const doc_type = String(form.get("doc_type") ?? "").trim();
    const file_name = String(form.get("file_name") ?? "").trim();
    const mime_type =
      String(form.get("mime_type") ?? "").trim() || "application/octet-stream";

    const chunk_index = Number(form.get("chunk_index"));
    const total_chunks = Number(form.get("total_chunks"));
    const upload_session_id = String(form.get("upload_session_id") ?? "").trim();
    const total_size = Number(form.get("total_size"));
    const chunk_size = Number(form.get("chunk_size"));

    const upload_url_override = String(form.get("upload_url") ?? "").trim();

    const chunk = form.get("chunk");

    if (!application_id || !doc_type || !file_name || !upload_session_id) {
      return NextResponse.json(
        {
          error:
            "application_id, doc_type, file_name, and upload_session_id are required.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(chunk_index) ||
      !Number.isFinite(total_chunks) ||
      chunk_index < 0 ||
      total_chunks <= 0 ||
      chunk_index >= total_chunks
    ) {
      return NextResponse.json({ error: "Invalid chunk_index/total_chunks." }, { status: 400 });
    }

    if (!Number.isFinite(total_size) || total_size <= 0) {
      return NextResponse.json({ error: "total_size is required." }, { status: 400 });
    }

    if (!Number.isFinite(chunk_size) || chunk_size <= 0) {
      return NextResponse.json({ error: "chunk_size is required." }, { status: 400 });
    }

    if (!(chunk instanceof File) || chunk.size <= 0) {
      return NextResponse.json({ error: "chunk file is required." }, { status: 400 });
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from("applications")
      .select("id, app_number, customer_name, drive_folder_id")
      .eq("id", application_id)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    let driveFolderId = String(app.drive_folder_id ?? "");
    if (!driveFolderId) {
      try {
        const folder = await createApplicationFolder(
          String(app.app_number ?? "APP-UNKNOWN"),
          String(app.customer_name ?? "Customer")
        );
        driveFolderId = folder.id;

        const { error: updateError } = await supabaseAdmin
          .from("applications")
          .update({
            drive_folder_id: folder.id,
            drive_folder_url: folder.url,
          })
          .eq("id", application_id);
        if (updateError) {
          console.error("Created Drive folder but failed to save to application", {
            application_id,
            message: updateError.message,
          });
        }
      } catch (folderError) {
        const message =
          folderError instanceof Error ? folderError.message : String(folderError);
        return NextResponse.json(
          { error: `Application has no Drive folder configured: ${message}` },
          { status: 500 }
        );
      }
    }

    let uploadUrl = upload_url_override;
    if (!uploadUrl) {
      uploadUrl = UPLOAD_SESSIONS.get(upload_session_id)?.uploadUrl ?? "";
    }

    if (chunk_index === 0 && !uploadUrl) {
      const driveFileName = originalUploadDriveName(doc_type, file_name);
      uploadUrl = await createDriveResumableUploadSession(
        driveFileName,
        mime_type,
        driveFolderId
      );
      UPLOAD_SESSIONS.set(upload_session_id, { uploadUrl, createdAt: Date.now() });
    }

    if (!uploadUrl) {
      return NextResponse.json(
        {
          error:
            "Missing upload session. Please restart upload from the first chunk.",
        },
        { status: 400 }
      );
    }

    const { start, end } = getRangeForChunk(
      chunk_index,
      chunk_size,
      total_size,
      chunk.size
    );

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mime_type,
        "Content-Length": String(chunk.size),
        "Content-Range": `bytes ${start}-${end}/${total_size}`,
      },
      body: chunk,
    });

    // 308 = resumable upload incomplete, final chunk returns 200/201 with file JSON.
    if (res.status === 308) {
      return NextResponse.json(
        {
          ok: true,
          upload_url: uploadUrl,
          uploaded_chunks: chunk_index + 1,
          total_chunks,
        },
        { status: 200 }
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: body || `Drive upload failed (${res.status}).`, upload_url: uploadUrl },
        { status: 502 }
      );
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    const drive_file_id = String(json.id ?? "").trim();
    if (!drive_file_id) {
      return NextResponse.json(
        { error: "Drive upload finished but did not return file id.", upload_url: uploadUrl },
        { status: 502 }
      );
    }

    // Finalize: save document record via existing confirm endpoint.
    const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    const base =
      origin.startsWith("http://") || origin.startsWith("https://")
        ? origin.split("/").slice(0, 3).join("/")
        : "";
    const confirmUrl = base ? `${base}/api/documents/confirm` : "/api/documents/confirm";

    const confirmRes = await fetch(confirmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id,
        doc_type,
        file_name,
        drive_file_id,
      }),
    });
    const confirmJson = await confirmRes.json().catch(() => ({}));
    if (!confirmRes.ok) {
      return NextResponse.json(
        { error: (confirmJson as any)?.error ?? "Failed to confirm document." },
        { status: 500 }
      );
    }

    UPLOAD_SESSIONS.delete(upload_session_id);

    return NextResponse.json(
      {
        ok: true,
        upload_url: uploadUrl,
        uploaded_chunks: total_chunks,
        total_chunks,
        drive_file_id,
        document: (confirmJson as any).document,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
