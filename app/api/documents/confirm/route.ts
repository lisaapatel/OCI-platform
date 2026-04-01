import { NextResponse } from "next/server";

import { deleteFile, setFilePublicReadable } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      doc_type?: string;
      file_name?: string;
      drive_file_id?: string;
    };

    const application_id = String(body.application_id ?? "").trim();
    const doc_type = String(body.doc_type ?? "").trim();
    const file_name = String(body.file_name ?? "").trim();
    const drive_file_id = String(body.drive_file_id ?? "").trim();

    if (!application_id || !doc_type || !file_name || !drive_file_id) {
      return NextResponse.json(
        { error: "application_id, doc_type, file_name, and drive_file_id are required." },
        { status: 400 }
      );
    }

    const drive_view_url = `https://drive.google.com/file/d/${drive_file_id}/view`;

    try {
      await setFilePublicReadable(drive_file_id);
    } catch (permErr) {
      const message = permErr instanceof Error ? permErr.message : String(permErr);
      console.error("Failed to set Drive file permissions", {
        drive_file_id,
        message,
      });
    }

    const { data: existing } = await supabaseAdmin
      .from("documents")
      .select("id, drive_file_id")
      .eq("application_id", application_id)
      .eq("doc_type", doc_type)
      .maybeSingle();

    if (existing?.id) {
      if (existing.drive_file_id && existing.drive_file_id !== drive_file_id) {
        try {
          await deleteFile(existing.drive_file_id);
        } catch {
          // Best-effort cleanup for prior file.
        }
      }
      await supabaseAdmin.from("documents").delete().eq("id", existing.id);
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
