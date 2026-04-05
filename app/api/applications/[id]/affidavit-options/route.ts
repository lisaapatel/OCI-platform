import { NextResponse } from "next/server";

import { getChecklistForApplication } from "@/lib/application-checklist";
import { isOciServiceType } from "@/lib/oci-intake-variant";
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
      .select("id, service_type, is_minor, oci_intake_variant")
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
            "Affidavit options are only available for OCI applications (oci_new or oci_renewal).",
        },
        { status: 403 },
      );
    }

    const checklist = getChecklistForApplication({
      service_type: app.service_type,
      is_minor: app.is_minor === true,
      oci_intake_variant: app.oci_intake_variant ?? null,
    });

    const { data: docRows } = await supabaseAdmin
      .from("documents")
      .select("doc_type")
      .eq("application_id", id);

    const uploadedDocTypes = [
      ...new Set(
        (docRows ?? [])
          .map((r) => String((r as { doc_type?: string }).doc_type ?? "").trim())
          .filter(Boolean),
      ),
    ];

    return NextResponse.json({
      checklist,
      uploadedDocTypes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 },
    );
  }
}
