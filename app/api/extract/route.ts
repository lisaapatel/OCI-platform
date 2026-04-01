import { NextResponse } from "next/server";

import { extractFieldsFromDocument } from "@/lib/claude";
import { getFileAsBase64 } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { application_id?: string };
    const application_id = (body.application_id ?? "").trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    const { data: docs, error: listError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("application_id", application_id)
      .eq("extraction_status", "pending");

    if (listError) {
      return NextResponse.json(
        { error: `Failed to list documents: ${listError.message}` },
        { status: 500 }
      );
    }

    const pending = docs ?? [];
    let processedAny = false;

    for (const doc of pending) {
      processedAny = true;
      try {
        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "processing" })
          .eq("id", doc.id);

        const b64 = await getFileAsBase64(doc.drive_file_id);
        const mimeType = "application/pdf";
        const extracted = await extractFieldsFromDocument({
          base64: b64,
          mimeType,
          docType: doc.doc_type,
        });

        for (const [field_name, field_value] of Object.entries(extracted)) {
          const { error: insErr } = await supabaseAdmin
            .from("extracted_fields")
            .insert({
              application_id,
              field_name,
              field_value,
              source_doc_type: doc.doc_type,
              is_flagged: false,
              flag_note: "",
            });
          if (insErr) {
            throw new Error(insErr.message);
          }
        }

        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "done" })
          .eq("id", doc.id);
      } catch {
        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "failed" })
          .eq("id", doc.id);
      }
    }

    if (processedAny) {
      const { count: pendingLeft } = await supabaseAdmin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("application_id", application_id)
        .eq("extraction_status", "pending");

      const { count: docCount } = await supabaseAdmin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("application_id", application_id);

      if ((pendingLeft ?? 0) === 0 && (docCount ?? 0) > 0) {
        await supabaseAdmin
          .from("applications")
          .update({ status: "ready_for_review" })
          .eq("id", application_id);
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
