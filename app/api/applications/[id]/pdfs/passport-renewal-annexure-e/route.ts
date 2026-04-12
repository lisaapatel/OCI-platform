import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import {
  FORM_FILLING_TEMPLATE_FILES,
  formFillingTemplatePath,
} from "@/lib/form-filling-templates";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select("id, app_number, service_type")
      .eq("id", id)
      .maybeSingle();

    if (error || !app) {
      return NextResponse.json(
        { error: "Application not found." },
        { status: 404 },
      );
    }

    if (String(app.service_type ?? "") !== "passport_renewal") {
      return NextResponse.json(
        {
          error:
            "This PDF is only available for passport renewal applications.",
        },
        { status: 403 },
      );
    }

    const templatePath = formFillingTemplatePath("passportRenewalAnnexureE");
    let pdfBytes: Buffer;
    try {
      pdfBytes = await readFile(templatePath);
    } catch {
      return NextResponse.json(
        {
          error: `Missing PDF template (${FORM_FILLING_TEMPLATE_FILES.passportRenewalAnnexureE}).`,
        },
        { status: 500 },
      );
    }

    const appNumber = String(app.app_number ?? "").trim();
    const filename = `passport_renewal_annexure_e_${appNumber || id}.pdf`;

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 },
    );
  }
}
