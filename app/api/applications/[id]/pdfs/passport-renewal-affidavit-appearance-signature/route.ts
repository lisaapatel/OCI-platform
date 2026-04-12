import { NextResponse } from "next/server";

import {
  resolveApplicantFullNameForPortalPdfs,
  resolveApplicantPassportNumberForPortalPdfs,
} from "@/lib/applicant-passport-full-name-server";
import { getFileAsBase64 } from "@/lib/google-drive";
import { generatePassportRenewalAffidavitAppearancePdf } from "@/lib/pdf-generators/passport-renewal-affidavit-appearance-signature";
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
      .select("id, customer_name, app_number, service_type")
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

    const customerName = String(app.customer_name ?? "").trim();
    const applicantFullName = await resolveApplicantFullNameForPortalPdfs(
      id,
      customerName,
    );
    const passportNumber =
      await resolveApplicantPassportNumberForPortalPdfs(id);
    if (!applicantFullName || !passportNumber) {
      return NextResponse.json(
        {
          error:
            "Applicant name or passport number is missing. Ensure current passport has been extracted and reviewed.",
        },
        { status: 422 },
      );
    }

    let applicantPhotoBytes: Uint8Array | null = null;
    const { data: photoRows } = await supabaseAdmin
      .from("documents")
      .select("drive_file_id, fixed_drive_file_id")
      .eq("application_id", id)
      .eq("doc_type", "applicant_photo")
      .order("uploaded_at", { ascending: false })
      .limit(1);

    const photoRow = photoRows?.[0];
    const photoDriveId = photoRow?.fixed_drive_file_id
      ? String(photoRow.fixed_drive_file_id).trim()
      : photoRow?.drive_file_id
        ? String(photoRow.drive_file_id).trim()
        : "";

    if (photoDriveId) {
      try {
        const b64 = await getFileAsBase64(photoDriveId);
        applicantPhotoBytes = Buffer.from(b64, "base64");
      } catch {
        applicantPhotoBytes = null;
      }
    }

    const pdfBytes = await generatePassportRenewalAffidavitAppearancePdf({
      applicantFullName,
      passportNumber,
      applicantPhotoBytes,
    });

    const appNumber = String(app.app_number ?? "").trim();
    const filename = `passport_renewal_affidavit_change_appearance_signature_${appNumber || id}.pdf`;

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
