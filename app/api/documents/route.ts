import { NextResponse } from "next/server";

import {
  createApplicationFolder,
  deleteFile,
  uploadFileToDrive,
} from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const application_id = url.searchParams.get("application_id")?.trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id query param is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("application_id", application_id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    let application_id = "";
    let doc_type = "";
    let file: File | null = null;
    let file_name = "";
    let storage_bucket = "";
    let storage_path = "";

    if (isJson) {
      const body = (await req.json()) as {
        application_id?: string;
        doc_type?: string;
        file_name?: string;
        storage_bucket?: string;
        storage_path?: string;
      };
      application_id = String(body.application_id ?? "").trim();
      doc_type = String(body.doc_type ?? "").trim();
      file_name = String(body.file_name ?? "").trim();
      storage_bucket = String(body.storage_bucket ?? "").trim();
      storage_path = String(body.storage_path ?? "").trim();
      if (!file_name || !storage_path || !storage_bucket) {
        return NextResponse.json(
          {
            error:
              "file_name, storage_bucket, and storage_path are required for JSON uploads.",
          },
          { status: 400 }
        );
      }
    } else {
      const formData = await req.formData();
      application_id = String(formData.get("application_id") ?? "").trim();
      doc_type = String(formData.get("doc_type") ?? "").trim();
      const formFile = formData.get("file");
      file = formFile instanceof File ? formFile : null;
      file_name = file?.name ?? "";
    }

    if (!application_id || !doc_type) {
      return NextResponse.json(
        { error: "application_id and doc_type are required." },
        { status: 400 }
      );
    }

    if (!(file instanceof File) || (!isJson && file.size === 0)) {
      return NextResponse.json(
        { error: "A non-empty file is required." },
        { status: 400 }
      );
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from("applications")
      .select("id, app_number, customer_name, drive_folder_id")
      .eq("id", application_id)
      .single();

    if (appError || !app) {
      return NextResponse.json(
        { error: "Application not found." },
        { status: 404 }
      );
    }

    let driveFolderId = app.drive_folder_id ?? "";
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

    const { data: existing } = await supabaseAdmin
      .from("documents")
      .select("id, drive_file_id")
      .eq("application_id", application_id)
      .eq("doc_type", doc_type)
      .maybeSingle();

    if (existing?.id) {
      if (existing.drive_file_id) {
        try {
          await deleteFile(existing.drive_file_id);
        } catch {
          // Best-effort cleanup
        }
      }
      await supabaseAdmin.from("documents").delete().eq("id", existing.id);
    }

    let drive_file_id = "";
    let drive_view_url = "";

    if (isJson) {
      drive_file_id = `sb:${storage_bucket}/${storage_path}`;
      const { data: publicData } = supabaseAdmin.storage
        .from(storage_bucket)
        .getPublicUrl(storage_path);
      drive_view_url = publicData.publicUrl;
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || "application/octet-stream";
      const uploaded = await uploadFileToDrive(
        buffer,
        file.name,
        mimeType,
        driveFolderId
      );
      drive_file_id = uploaded.id;
      drive_view_url = uploaded.url;
    }

    const { data: row, error: insertError } = await supabaseAdmin
      .from("documents")
      .insert({
        application_id,
        doc_type,
        file_name,
        drive_file_id,
        drive_view_url,
        extraction_status: "pending",
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to save document: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: row.id, document: row }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 }
    );
  }
}
