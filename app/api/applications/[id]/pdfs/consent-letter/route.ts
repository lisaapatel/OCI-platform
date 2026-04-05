import { NextResponse } from "next/server";

import { resolveApplicantFullNameForPortalPdfs } from "@/lib/applicant-passport-full-name-server";
import { getFileAsBase64 } from "@/lib/google-drive";
import { generateConsentLetterPdf } from "@/lib/pdf-generators/consent-letter";
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
      .select(
        "id, customer_name, oci_file_reference_number, app_number, service_type",
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
    if (st !== "oci_new" && st !== "oci_renewal") {
      return NextResponse.json(
        {
          error:
            "This PDF is only available for OCI applications (oci_new or oci_renewal).",
        },
        { status: 403 },
      );
    }

    const ociRef = String(app.oci_file_reference_number ?? "").trim();
    if (!ociRef) {
      return NextResponse.json(
        {
          error:
            "OCI file reference number is required before generating this PDF. Save it from the government OCI portal first.",
        },
        { status: 422 },
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

    const today = new Date();
    const date = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

    let signatureJpegBytes: Uint8Array | null = null;
    const { data: sigRows } = await supabaseAdmin
      .from("documents")
      .select("drive_file_id")
      .eq("application_id", id)
      .eq("doc_type", "applicant_signature")
      .order("uploaded_at", { ascending: false })
      .limit(1);
    const sigDoc = sigRows?.[0];

    const driveId = sigDoc?.drive_file_id
      ? String(sigDoc.drive_file_id).trim()
      : "";
    if (driveId) {
      try {
        const b64 = await getFileAsBase64(driveId);
        signatureJpegBytes = Buffer.from(b64, "base64");
      } catch {
        signatureJpegBytes = null;
      }
    }

    const pdfBytes = await generateConsentLetterPdf({
      ociFileReferenceNumber: ociRef,
      applicantFullName,
      date,
      signatureJpegBytes,
    });

    const appNumber = String(app.app_number ?? "").trim();
    const filename = `consent_letter_${appNumber || id}.pdf`;

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
