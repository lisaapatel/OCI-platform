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
    const formData = await req.formData();
    const application_id = String(formData.get("application_id") ?? "").trim();
    const doc_type = String(formData.get("doc_type") ?? "").trim();
    const file = formData.get("file");

    if (!application_id || !doc_type) {
      return NextResponse.json(
        { error: "application_id and doc_type are required." },
        { status: 400 }
      );
    }

    if (!(file instanceof File) || file.size === 0) {
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const uploaded = await uploadFileToDrive(
      buffer,
      file.name,
      mimeType,
      driveFolderId
    );

    const { data: row, error: insertError } = await supabaseAdmin
      .from("documents")
      .insert({
        application_id,
        doc_type,
        file_name: file.name,
        drive_file_id: uploaded.id,
        drive_view_url: uploaded.url,
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
