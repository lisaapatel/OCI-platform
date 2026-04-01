import { NextResponse } from "next/server";

import {
  type GovtImageType,
  fixGovtImage,
} from "@/lib/govt-photo-signature";
import { govtFixedDriveName } from "@/lib/drive-file-naming";
import {
  findOrCreateChildFolder,
  getDriveFileMetadata,
  getFileAsBase64,
  uploadFileToDrive,
} from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const GOOGLE_NATIVE = "application/vnd.google-apps.";

const DOC_BY_TYPE: Record<GovtImageType, string> = {
  photo: "applicant_photo",
  signature: "applicant_signature",
};

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 100) / 100;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      drive_file_id?: string;
      image_type?: string;
    };

    const application_id = String(body.application_id ?? "").trim();
    const drive_file_id = String(body.drive_file_id ?? "").trim();
    const image_type = String(body.image_type ?? "").trim() as GovtImageType;

    if (!application_id || !drive_file_id) {
      return NextResponse.json(
        { error: "application_id and drive_file_id are required." },
        { status: 400 }
      );
    }

    if (image_type !== "photo" && image_type !== "signature") {
      return NextResponse.json(
        { error: "image_type must be 'photo' or 'signature'." },
        { status: 400 }
      );
    }

    const expectedDocType = DOC_BY_TYPE[image_type];

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("id, doc_type, file_name, drive_file_id")
      .eq("application_id", application_id)
      .eq("drive_file_id", drive_file_id)
      .maybeSingle();

    if (docErr || !doc) {
      return NextResponse.json(
        { error: "Document not found for this application." },
        { status: 404 }
      );
    }

    if (String(doc.doc_type) !== expectedDocType) {
      return NextResponse.json(
        {
          error: `This file is registered as "${doc.doc_type}"; expected "${expectedDocType}" for ${image_type} fix.`,
        },
        { status: 400 }
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
    if (meta.mimeType.startsWith(GOOGLE_NATIVE)) {
      return NextResponse.json(
        {
          error:
            "Google Docs native file — export as image and upload again.",
        },
        { status: 400 }
      );
    }

    const b64 = await getFileAsBase64(drive_file_id);
    const buffer = Buffer.from(b64, "base64");

    const { buffer: out, width, height } = await fixGovtImage(
      buffer,
      image_type
    );

    const fixedFolderId = await findOrCreateChildFolder(
      String(app.drive_folder_id),
      "Fixed"
    );

    const uploaded = await uploadFileToDrive(
      out,
      govtFixedDriveName(String(doc.doc_type)),
      "image/jpeg",
      fixedFolderId
    );

    const { error: upErr } = await supabaseAdmin
      .from("documents")
      .update({
        fixed_drive_file_id: uploaded.id,
        fixed_drive_url: uploaded.url,
        fixed_size_bytes: out.length,
      })
      .eq("id", doc.id);

    if (upErr) {
      console.error("fix-image: failed to save fixed metadata", upErr);
    }

    return NextResponse.json(
      {
        ok: true,
        fixed_file_id: uploaded.id,
        fixed_size_kb: kb(out.length),
        fixed_dimensions: `${width}×${height}px`,
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
