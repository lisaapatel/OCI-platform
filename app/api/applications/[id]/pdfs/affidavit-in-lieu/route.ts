import { NextResponse } from "next/server";

import {
  buildAffidavitDocumentLines,
  validateAffidavitSelection,
} from "@/lib/affidavit-in-lieu-lines";
import { resolveApplicantFullNameForPortalPdfs } from "@/lib/applicant-passport-full-name-server";
import { getChecklistForApplication } from "@/lib/application-checklist";
import { isOciServiceType } from "@/lib/oci-intake-variant";
import { generateAffidavitInLieuPdf } from "@/lib/pdf-generators/affidavit-in-lieu";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Expected JSON body with selectedDocTypes array." },
        { status: 400 },
      );
    }

    const selectedRaw = (body as { selectedDocTypes?: unknown }).selectedDocTypes;
    if (!Array.isArray(selectedRaw)) {
      return NextResponse.json(
        { error: "Body must include selectedDocTypes: string[]." },
        { status: 400 },
      );
    }
    const selectedDocTypes = selectedRaw.map((x) => String(x ?? ""));
    const customRaw = (body as { customLines?: unknown }).customLines;
    const customLines = Array.isArray(customRaw)
      ? customRaw.map((x) => String(x ?? ""))
      : [];

    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select(
        "id, customer_name, app_number, service_type, is_minor, oci_intake_variant",
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !app) {
      return NextResponse.json(
        { error: "Application not found." },
        { status: 404 },
      );
    }

    const st = String(app.service_type ?? "");
    if (!isOciServiceType(st)) {
      return NextResponse.json(
        {
          error:
            "This PDF is only available for OCI applications (oci_new or oci_renewal).",
        },
        { status: 403 },
      );
    }

    const checklist = getChecklistForApplication({
      service_type: app.service_type,
      is_minor: app.is_minor === true,
      oci_intake_variant: app.oci_intake_variant ?? null,
    });

    const validation = validateAffidavitSelection(
      checklist,
      selectedDocTypes,
      customLines,
    );
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }

    const lines = buildAffidavitDocumentLines(
      checklist,
      validation.selectedSet,
      validation.normalizedCustomLines,
    );
    if (
      lines.length !==
      validation.selectedSet.size + validation.normalizedCustomLines.length
    ) {
      return NextResponse.json(
        {
          error:
            "Selection could not be mapped to checklist rows. Refresh and try again.",
        },
        { status: 400 },
      );
    }

    const customerName = String(app.customer_name ?? "").trim();
    const applicantFullName = await resolveApplicantFullNameForPortalPdfs(
      id,
      customerName,
    );
    if (!applicantFullName) {
      return NextResponse.json(
        {
          error:
            "Applicant name is missing. Add it on the application or ensure the current passport is extracted with a full name.",
        },
        { status: 422 },
      );
    }

    const pdfBytes = await generateAffidavitInLieuPdf({
      applicantFullName,
      documentLines: lines,
    });

    const appNumber = String(app.app_number ?? "").trim();
    const filename = `affidavit_in_lieu_of_originals_${appNumber || id}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
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
