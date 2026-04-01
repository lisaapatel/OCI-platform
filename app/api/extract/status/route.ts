import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const application_id = String(url.searchParams.get("application_id") ?? "").trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    const { data: app, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, status")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    const [{ count: total }, { count: pending }, { count: processing }, { count: done }, { count: failed }] =
      await Promise.all([
        supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("application_id", application_id),
        supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("application_id", application_id)
          .eq("extraction_status", "pending"),
        supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("application_id", application_id)
          .eq("extraction_status", "processing"),
        supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("application_id", application_id)
          .eq("extraction_status", "done"),
        supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("application_id", application_id)
          .eq("extraction_status", "failed"),
      ]);

    return NextResponse.json(
      {
        application_id,
        application_status: app.status,
        totals: {
          total: total ?? 0,
          pending: pending ?? 0,
          processing: processing ?? 0,
          done: done ?? 0,
          failed: failed ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

