import { NextResponse } from "next/server";

import { deleteFile } from "@/lib/google-drive";
import { isMinorParentDocTypeTransition } from "@/lib/parent-documents";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";
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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    let body: { doc_type?: string };
    try {
      body = (await req.json()) as { doc_type?: string };
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const nextType = String(body.doc_type ?? "").trim();
    if (!nextType) {
      return NextResponse.json(
        { error: "doc_type is required." },
        { status: 400 }
      );
    }

    const { data: row, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("id, doc_type, application_id")
      .eq("id", id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const currentType = String(row.doc_type ?? "").trim();
    if (!isMinorParentDocTypeTransition(currentType, nextType)) {
      return NextResponse.json(
        {
          error:
            "Only switching between Indian passport and OCI for the same minor parent slot is allowed.",
        },
        { status: 400 }
      );
    }

    const { data: appRow } = await supabaseAdmin
      .from("applications")
      .select("service_type")
      .eq("id", String(row.application_id ?? ""))
      .maybeSingle();

    const extraction_status = shouldSkipAiExtraction(nextType, {
      serviceType: appRow?.service_type ?? null,
    })
      ? "done"
      : "pending";

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("documents")
      .update({
        doc_type: nextType,
        extraction_status,
        failure_reason: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? "Update failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ document: updated }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
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
