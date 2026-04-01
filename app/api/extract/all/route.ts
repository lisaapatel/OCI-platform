import { NextResponse } from "next/server";

import { extractFieldsFromDocument } from "@/lib/claude";
import { getFileAsBase64 } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

async function getDocumentAsBase64(ref: string): Promise<string> {
  const sbRef = parseSupabaseObjectRef(ref);
  if (!sbRef) return getFileAsBase64(ref);

  const { data, error } = await supabaseAdmin.storage
    .from(sbRef.bucket)
    .download(sbRef.path);
  if (error || !data) {
    throw new Error(`Failed to download storage object: ${error?.message ?? "Unknown error"}`);
  }

  const ab = await data.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

// Kept for reference: multi-document extraction loop.
export async function POST(req: Request) {
  try {
    console.log("POST /api/extract/all hit");
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set" },
        { status: 500 }
      );
    }

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
    let docsProcessed = 0;
    let fieldsExtracted = 0;

    for (const doc of pending) {
      try {
        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "processing" })
          .eq("id", doc.id);

        const b64 = await getDocumentAsBase64(doc.drive_file_id);
        if (!b64) {
          await supabaseAdmin
            .from("documents")
            .update({ extraction_status: "failed" })
            .eq("id", doc.id);
          continue;
        }

        const mimeType = "application/pdf";
        const extracted = await extractFieldsFromDocument({
          base64: b64,
          mimeType,
          docType: doc.doc_type,
        });

        const { error: delErr } = await supabaseAdmin
          .from("extracted_fields")
          .delete()
          .eq("application_id", application_id)
          .eq("source_doc_type", doc.doc_type);
        if (delErr) throw new Error(delErr.message);

        // is_flagged is never set from AI — team flags only via review UI.
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
          if (insErr) throw new Error(insErr.message);
          fieldsExtracted += 1;
        }

        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "done" })
          .eq("id", doc.id);
        docsProcessed += 1;
      } catch {
        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "failed" })
          .eq("id", doc.id);
      }
    }

    return NextResponse.json(
      { ok: true, docs_processed: docsProcessed, fields_extracted: fieldsExtracted },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

