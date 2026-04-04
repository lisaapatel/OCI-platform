import { NextResponse } from "next/server";

import { generateUndertakingPdf } from "@/lib/pdf-generators/undertaking-oci-applicant";
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
    if (!customerName) {
      return NextResponse.json(
        { error: "Applicant name is missing." },
        { status: 422 },
      );
    }

    const today = new Date();
    const date = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

    const pdfBytes = await generateUndertakingPdf({
      ociFileReferenceNumber: ociRef,
      applicantFullName: customerName,
      date,
    });

    const appNumber = String(app.app_number ?? "").trim();
    const filename = `undertaking_oci_applicant_${appNumber || id}.pdf`;

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
