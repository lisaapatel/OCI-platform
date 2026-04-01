import { NextResponse } from "next/server";

import { deleteFile } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const { data: doc, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("id, drive_file_id")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    if (doc.drive_file_id) {
      try {
        await deleteFile(doc.drive_file_id);
      } catch {
        // Continue removing DB row even if Drive delete fails (e.g. already gone)
      }
    }

    const { error: delError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", id);

    if (delError) {
      return NextResponse.json(
        { error: `Failed to remove document: ${delError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
}
