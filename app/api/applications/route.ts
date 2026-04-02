import { NextResponse } from "next/server";

import { createApplicationFolder } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

function toAppNumber(n: number) {
  return `APP-${String(n).padStart(4, "0")}`;
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
    };

    const customer_name = (body.customer_name ?? "").trim();
    const service_type = body.service_type;
    const customer_email = (body.customer_email ?? "").trim() || null;
    const customer_phone = (body.customer_phone ?? "").trim() || null;
    const notes = (body.notes ?? "").trim() || null;

    if (!customer_name) {
      return NextResponse.json(
        { error: "Full Name is required." },
        { status: 400 }
      );
    }
    if (
      !service_type ||
      (service_type !== "oci_new" &&
        service_type !== "oci_renewal" &&
        service_type !== "passport_renewal" &&
        service_type !== "passport_us_renewal_test")
    ) {
      return NextResponse.json(
        { error: "Service Type is required." },
        { status: 400 }
      );
    }
    if (service_type === "passport_renewal") {
      return NextResponse.json(
        { error: "Passport Renewal is coming soon." },
        { status: 400 }
      );
    }

    // a) Generate app_number by counting existing apps
    const { count, error: countError } = await supabaseAdmin
      .from("applications")
      .select("id", { count: "exact", head: true });

    if (countError) {
      return NextResponse.json(
        { error: `Failed to generate app number: ${countError.message}` },
        { status: 500 }
      );
    }

    const nextNum = (count ?? 0) + 1;
    const app_number = toAppNumber(nextNum);

    // b) Create Google Drive folder
    let driveFolderId = "";
    let driveFolderUrl = "";
    try {
      const driveFolder = await createApplicationFolder(app_number, customer_name);
      driveFolderId = driveFolder.id;
      driveFolderUrl = driveFolder.url;
    } catch (error) {
      const err = error as Error & { stack?: string };
      console.error("Google Drive folder creation failed", {
        message: err?.message,
        stack: err?.stack,
      });
      // Continue creating the application even if Drive setup fails.
    }

    // c) Insert row
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("applications")
      .insert({
        app_number,
        customer_name,
        customer_email,
        customer_phone,
        service_type,
        status: "docs_pending",
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolderUrl,
        notes,
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to create application: ${insertError.message}` },
        { status: 500 }
      );
    }

    // d) Return new ID
    return NextResponse.json({ id: inserted.id }, { status: 200 });
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

