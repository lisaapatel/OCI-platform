import { NextResponse } from "next/server";
import sharp from "sharp";

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
import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";
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

function decodeBase64Image(raw: string): Buffer {
  const s = raw.trim();
  const idx = s.indexOf("base64,");
  const b64 =
    idx >= 0 ? s.slice(idx + "base64,".length).replace(/\s/g, "") : s.replace(/\s/g, "");
  return Buffer.from(b64, "base64");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      drive_file_id?: string;
      document_id?: string;
      image_base64?: string;
      image_type?: string;
    };

    const application_id = String(body.application_id ?? "").trim();
    const image_type = String(body.image_type ?? "").trim() as GovtImageType;

    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
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
    const clientCropPath =
      Boolean(String(body.image_base64 ?? "").trim()) &&
      Boolean(String(body.document_id ?? "").trim());

    let doc: {
      id: string;
      doc_type: string;
      file_name: string;
      drive_file_id: string;
    };
    let out: Buffer;
    let width: number;
    let height: number;

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

    if (clientCropPath) {
      if (image_type !== "photo") {
        return NextResponse.json(
          {
            error:
              "Client-provided image is only supported for image_type 'photo'.",
          },
          { status: 400 }
        );
      }

      const document_id = String(body.document_id ?? "").trim();
      const { data: row, error: docErr } = await supabaseAdmin
        .from("documents")
        .select("id, doc_type, file_name, drive_file_id")
        .eq("id", document_id)
        .eq("application_id", application_id)
        .maybeSingle();

      if (docErr || !row) {
        return NextResponse.json(
          { error: "Document not found for this application." },
          { status: 404 }
        );
      }

      if (String(row.doc_type) !== "applicant_photo") {
        return NextResponse.json(
          {
            error: `Expected applicant_photo; got "${row.doc_type}".`,
          },
          { status: 400 }
        );
      }

      doc = row;
      out = decodeBase64Image(String(body.image_base64));

      if (out.length > PORTAL_IMAGE_MAX_BYTES) {
        return NextResponse.json(
          {
            error: `Image is ${kb(out.length)}KB; portal max is ${kb(PORTAL_IMAGE_MAX_BYTES)}KB.`,
          },
          { status: 400 }
        );
      }

      const meta = await sharp(out, { failOn: "none" }).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      if (meta.format && meta.format !== "jpeg") {
        return NextResponse.json(
          { error: "Client image must be JPEG." },
          { status: 400 }
        );
      }
    } else {
      const drive_file_id = String(body.drive_file_id ?? "").trim();
      if (!drive_file_id) {
        return NextResponse.json(
          {
            error:
              "drive_file_id is required unless document_id + image_base64 are sent.",
          },
          { status: 400 }
        );
      }

      const { data: row, error: docErr } = await supabaseAdmin
        .from("documents")
        .select("id, doc_type, file_name, drive_file_id")
        .eq("application_id", application_id)
        .eq("drive_file_id", drive_file_id)
        .maybeSingle();

      if (docErr || !row) {
        return NextResponse.json(
          { error: "Document not found for this application." },
          { status: 404 }
        );
      }

      if (String(row.doc_type) !== expectedDocType) {
        return NextResponse.json(
          {
            error: `This file is registered as "${row.doc_type}"; expected "${expectedDocType}" for ${image_type} fix.`,
          },
          { status: 400 }
        );
      }

      doc = row;

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

      const fixed = await fixGovtImage(buffer, image_type);
      out = fixed.buffer;
      width = fixed.width;
      height = fixed.height;
    }

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
