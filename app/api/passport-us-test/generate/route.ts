import { NextResponse } from "next/server";

import { generateDs82Pdf } from "@/lib/passport-us-test/generate-pdf";
import {
  extractedRowsToFieldMap,
  mapToDs82,
} from "@/lib/passport-us-test/map-ds82";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { application_id?: string };
    const application_id = String(body.application_id ?? "").trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 },
      );
    }

    const { data: app, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, service_type")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !app) {
      return NextResponse.json(
        { error: "Application not found." },
        { status: 404 },
      );
    }

    if (app.service_type !== "passport_us_renewal_test") {
      return NextResponse.json(
        {
          error:
            "This endpoint is only enabled for service_type passport_us_renewal_test.",
        },
        { status: 403 },
      );
    }

    const { data: rows, error: fieldsErr } = await supabaseAdmin
      .from("extracted_fields")
      .select("field_name, field_value")
      .eq("application_id", application_id);

    if (fieldsErr) {
      return NextResponse.json(
        { error: fieldsErr.message },
        { status: 500 },
      );
    }

    const fieldMap = extractedRowsToFieldMap(rows ?? []);
    const mapped = mapToDs82(fieldMap);
    const pdfBytes = await generateDs82Pdf(mapped);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="passport-ds82-test.pdf"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
