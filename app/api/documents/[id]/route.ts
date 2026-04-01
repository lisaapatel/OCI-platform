import { NextResponse } from "next/server";

import { deleteFile } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

function parseSupabaseObjectRef(ref: string): { bucket: string; path: string } | null {
  if (!ref.startsWith("sb:")) return null;
  const raw = ref.slice(3);
  const slash = raw.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucket: raw.slice(0, slash),
    path: raw.slice(slash + 1),
  };
}

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
        const sbRef = parseSupabaseObjectRef(doc.drive_file_id);
        if (sbRef) {
          await supabaseAdmin.storage.from(sbRef.bucket).remove([sbRef.path]);
        } else {
          await deleteFile(doc.drive_file_id);
        }
      } catch {
        // Continue removing DB row even if storage delete fails.
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
