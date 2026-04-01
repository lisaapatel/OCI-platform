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

export async function POST(req: Request) {
  try {
    console.log("POST /api/extract/single hit");

    const body = (await req.json()) as {
      application_id?: string;
      document_id?: string;
    };
    const application_id = String(body.application_id ?? "").trim();
    const document_id = String(body.document_id ?? "").trim();

    if (!application_id || !document_id) {
      return NextResponse.json(
        { error: "application_id and document_id are required." },
        { status: 400 }
      );
    }

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .eq("application_id", application_id)
      .single();

    if (docErr || !doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    if (doc.doc_type === "photo") {
      await supabaseAdmin
        .from("documents")
        .update({ extraction_status: "done" })
        .eq("id", doc.id);
      return NextResponse.json(
        { ok: true, fields_extracted: 0, field_data: [] },
        { status: 200 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set" },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("documents")
      .update({ extraction_status: "processing" })
      .eq("id", doc.id);

    console.log("Extracting single doc", {
      application_id,
      document_id: doc.id,
      doc_type: doc.doc_type,
      drive_file_id: doc.drive_file_id,
    });

    const b64 = await getDocumentAsBase64(doc.drive_file_id);
    if (!b64 || b64.length === 0) {
      await supabaseAdmin
        .from("documents")
        .update({ extraction_status: "failed" })
        .eq("id", doc.id);
      return NextResponse.json(
        { error: "Downloaded document was empty." },
        { status: 500 }
      );
    }

    const mimeType = "application/pdf";
    const extracted = await extractFieldsFromDocument({
      base64: b64,
      mimeType,
      docType: doc.doc_type,
    });

    const field_data: { field_name: string; field_value: string | null }[] = [];
    let fields_extracted = 0;
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
      fields_extracted += 1;
      field_data.push({ field_name, field_value: field_value ?? null });
    }

    await supabaseAdmin
      .from("documents")
      .update({ extraction_status: "done" })
      .eq("id", doc.id);

    return NextResponse.json(
      { ok: true, fields_extracted, field_data },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

