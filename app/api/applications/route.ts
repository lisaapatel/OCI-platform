import { NextResponse } from "next/server";

import { createApplicationFolder } from "@/lib/google-drive";
import {
  isOciServiceType,
  parseOciIntakeVariantFromBody,
} from "@/lib/oci-intake-variant";
import { supabaseAdmin } from "@/lib/supabase-admin";

function toAppNumber(n: number) {
  return `APP-${String(n).padStart(4, "0")}`;
}

/** Highest numeric suffix from APP-#### (null if none / unparsable). */
function parseAppNumberSerial(appNumber: string): number | null {
  const m = /^APP-(\d+)$/i.exec(String(appNumber).trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isUniqueAppNumberViolation(err: { message?: string; code?: string }) {
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  return code === "23505" || /duplicate key|unique constraint|app_number/i.test(msg);
}

export async function POST(req: Request) {
  try {
    console.log("ENV CHECK:", {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
      hasDriveFolderId: !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    });

    const body = (await req.json()) as {
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      service_type?:
        | "oci_new"
        | "oci_renewal"
        | "passport_renewal"
        | "passport_us_renewal_test";
      notes?: string;
      is_minor?: boolean;
      oci_intake_variant?: string | null;
    };

    const customer_name = (body.customer_name ?? "").trim();
    const service_type = body.service_type;
    const customer_email = (body.customer_email ?? "").trim() || null;
    const customer_phone = (body.customer_phone ?? "").trim() || null;
    const notes = (body.notes ?? "").trim() || null;
    let is_minor = false;
    if (body.is_minor !== undefined) {
      if (typeof body.is_minor !== "boolean") {
        return NextResponse.json(
          { error: "is_minor must be a boolean when provided." },
          { status: 400 }
        );
      }
      is_minor = body.is_minor;
    }

    if (!customer_name) {
      return NextResponse.json(
        { error: "Full Name is required." },
        { status: 400 }
      );
    }
    if (
      !service_type ||
      (!isOciServiceType(service_type) &&
        service_type !== "passport_renewal" &&
        service_type !== "passport_us_renewal_test")
    ) {
      return NextResponse.json(
        { error: "Service Type is required." },
        { status: 400 }
      );
    }

    let oci_intake_variant: string | null = null;
    if ("oci_intake_variant" in body) {
      const parsed = parseOciIntakeVariantFromBody(body.oci_intake_variant);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      oci_intake_variant = parsed.value;
    }
    if (oci_intake_variant !== null && !isOciServiceType(service_type)) {
      return NextResponse.json(
        {
          error:
            "oci_intake_variant is only valid for OCI applications (oci_new or oci_renewal).",
        },
        { status: 400 }
      );
    }
    // a) Next app_number = max(existing APP-####) + 1 (not count — avoids
    //    duplicates after deletes leave gaps, e.g. APP-0001 + APP-0003 → count 2 → APP-0003 clash).
    const resolveNextSerial = async (): Promise<
      { ok: true; serial: number } | { ok: false; message: string }
    > => {
      const { data: rows, error } = await supabaseAdmin
        .from("applications")
        .select("app_number")
        .order("app_number", { ascending: false })
        .limit(1);

      if (error) {
        return { ok: false, message: error.message };
      }

      const top = rows?.[0]?.app_number;
      if (top == null || String(top).trim() === "") {
        return { ok: true, serial: 1 };
      }

      const parsed = parseAppNumberSerial(String(top));
      if (parsed == null) {
        return {
          ok: false,
          message: `Cannot derive next app number from existing value: ${String(top)}`,
        };
      }
      return { ok: true, serial: parsed + 1 };
    };

    let insertedId: string | null = null;
    let app_number = "";
    let lastInsertError: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const next = await resolveNextSerial();
      if (!next.ok) {
        return NextResponse.json(
          { error: `Failed to generate app number: ${next.message}` },
          { status: 500 }
        );
      }

      app_number = toAppNumber(next.serial);

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("applications")
        .insert({
          app_number,
          customer_name,
          customer_email,
          customer_phone,
          service_type,
          status: "docs_pending",
          drive_folder_id: "",
          drive_folder_url: "",
          notes,
          is_minor,
          oci_intake_variant,
        })
        .select("id")
        .single();

      if (!insertError && inserted?.id) {
        insertedId = inserted.id;
        break;
      }

      lastInsertError = insertError ?? { message: "Unknown insert error" };
      if (!isUniqueAppNumberViolation(lastInsertError)) {
        return NextResponse.json(
          {
            error: `Failed to create application: ${lastInsertError.message ?? "insert failed"}`,
          },
          { status: 500 }
        );
      }
    }

    if (!insertedId) {
      return NextResponse.json(
        {
          error: `Failed to create application: ${lastInsertError?.message ?? "duplicate app_number retries exhausted"}`,
        },
        { status: 500 }
      );
    }

    try {
      const driveFolder = await createApplicationFolder(
        app_number,
        customer_name
      );
      await supabaseAdmin
        .from("applications")
        .update({
          drive_folder_id: driveFolder.id,
          drive_folder_url: driveFolder.url,
        })
        .eq("id", insertedId);
    } catch (error) {
      const err = error as Error & { stack?: string };
      console.error("Google Drive folder creation failed", {
        message: err?.message,
        stack: err?.stack,
      });
    }

    return NextResponse.json({ id: insertedId }, { status: 200 });
  } catch (error) {
    const err = error as Error & { stack?: string };
    console.error("POST /api/applications failed", {
      message: err?.message,
      stack: err?.stack,
      error: err,
    });
    return NextResponse.json(
      {
        error: err?.message ?? "Unknown error",
        stack: err?.stack ?? "",
      },
      { status: 500 }
    );
  }
}

