import { NextResponse } from "next/server";

import {
  createApplicationFolder,
  createDriveResumableUploadSession,
} from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      doc_type?: string;
      file_name?: string;
      mime_type?: string;
    };

    const application_id = String(body.application_id ?? "").trim();
    const doc_type = String(body.doc_type ?? "").trim();
    const file_name = String(body.file_name ?? "").trim();
    const mime_type =
      String(body.mime_type ?? "").trim() || "application/octet-stream";

    if (!application_id || !doc_type || !file_name) {
      return NextResponse.json(
        { error: "application_id, doc_type, and file_name are required." },
        { status: 400 }
      );
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

    const upload_url = await createDriveResumableUploadSession(
      file_name,
      mime_type,
      driveFolderId
    );

    return NextResponse.json(
      {
        upload_url,
        drive_folder_id: driveFolderId,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
