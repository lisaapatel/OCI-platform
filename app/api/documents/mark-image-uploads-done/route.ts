import { NextResponse } from "next/server";

import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Marks pending applicant photo/signature documents as extraction done (no AI/OCR).
 * Used before bulk extract so image uploads are not sent through /api/extract/single.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { application_id?: string };
    const application_id = String(body.application_id ?? "").trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    const { data: appRow } = await supabaseAdmin
      .from("applications")
      .select("service_type")
      .eq("id", application_id)
      .maybeSingle();

    const { data: rows, error: listErr } = await supabaseAdmin
      .from("documents")
      .select("id, doc_type")
      .eq("application_id", application_id)
      .eq("extraction_status", "pending");

    if (listErr) {
      return NextResponse.json(
        { error: listErr.message },
        { status: 500 }
      );
    }

    const ids =
      rows
        ?.filter((r) =>
          shouldSkipAiExtraction(r.doc_type, {
            serviceType: appRow?.service_type ?? null,
          })
        )
        .map((r) => r.id) ?? [];

    if (ids.length === 0) {
      return NextResponse.json({ updated: 0 }, { status: 200 });
    }

    const { error: upErr } = await supabaseAdmin
      .from("documents")
      .update({ extraction_status: "done", failure_reason: null })
      .in("id", ids);

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ updated: ids.length }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
