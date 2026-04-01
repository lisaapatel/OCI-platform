import { NextResponse } from "next/server";

import { compressForGovtPortal } from "@/lib/document-compress";
import { PORTAL_MAX_BYTES } from "@/lib/portal-constants";
import {
  findOrCreateChildFolder,
  getDriveFileMetadata,
  getFileAsBase64,
  uploadFileToDrive,
} from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const GOOGLE_NATIVE = "application/vnd.google-apps.";

function portalOutputName(originalName: string, outputMime: string): string {
  const trimmed = originalName.trim() || "document";
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = outputMime.includes("pdf") ? ".pdf" : ".jpg";
  return `${base}.portal${ext}`;
}

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      drive_file_id?: string;
      target_size_kb?: number;
    };

    const application_id = String(body.application_id ?? "").trim();
    const drive_file_id = String(body.drive_file_id ?? "").trim();
    const targetKb = Number(body.target_size_kb);
    const targetBytes =
      Number.isFinite(targetKb) && targetKb > 0
        ? Math.floor(targetKb * 1024)
        : Math.floor(450 * 1024);

    if (!application_id || !drive_file_id) {
      return NextResponse.json(
        { error: "application_id and drive_file_id are required." },
        { status: 400 }
      );
    }

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select(
        "id, application_id, file_name, drive_file_id, drive_view_url"
      )
      .eq("application_id", application_id)
      .eq("drive_file_id", drive_file_id)
      .maybeSingle();

    if (docErr || !doc) {
      return NextResponse.json(
        { error: "Document not found for this application." },
        { status: 404 }
      );
    }

    const { data: app, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, drive_folder_id")
      .eq("id", application_id)
      .single();

    if (appErr || !app?.drive_folder_id) {
      return NextResponse.json(
        { error: "Application has no Google Drive folder." },
        { status: 400 }
      );
    }

    const meta = await getDriveFileMetadata(drive_file_id);
    const originalSize = meta.size;

    if (originalSize <= PORTAL_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: true,
          message: "Already within limit",
          compressed_file_id: drive_file_id,
          compressed_size_kb: kb(originalSize),
          original_size_kb: kb(originalSize),
          drive_url: String(doc.drive_view_url ?? ""),
          document_id: doc.id,
        },
        { status: 200 }
      );
    }

    if (meta.mimeType.startsWith(GOOGLE_NATIVE)) {
      return NextResponse.json(
        {
          error:
            "This file is a Google Docs/Sheets native file. Download as PDF from Drive, then upload again.",
        },
        { status: 400 }
      );
    }

    const b64 = await getFileAsBase64(drive_file_id);
    const buffer = Buffer.from(b64, "base64");

    const { output, outputMime } = await compressForGovtPortal(
      buffer,
      meta.mimeType,
      targetBytes
    );

    if (output.length > PORTAL_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `Compressed file is still ${kb(output.length)}KB (portal limit 500KB). Try a lower target or split the document.`,
        },
        { status: 422 }
      );
    }

    const compressedFolderId = await findOrCreateChildFolder(
      String(app.drive_folder_id),
      "Compressed"
    );

    const outName = portalOutputName(
      String(doc.file_name ?? meta.name),
      outputMime
    );

    const uploaded = await uploadFileToDrive(
      output,
      outName,
      outputMime,
      compressedFolderId
    );

    const { error: upErr } = await supabaseAdmin
      .from("documents")
      .update({
        compressed_drive_file_id: uploaded.id,
        compressed_drive_url: uploaded.url,
        compressed_size_bytes: output.length,
      })
      .eq("id", doc.id);

    if (upErr) {
      console.error("compress: failed to save compressed metadata", upErr);
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Compressed and uploaded to Drive/Compressed",
        compressed_file_id: uploaded.id,
        compressed_size_kb: kb(output.length),
        original_size_kb: kb(originalSize),
        drive_url: uploaded.url,
        document_id: doc.id,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
