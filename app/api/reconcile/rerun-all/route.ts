import { NextResponse } from "next/server";

import { reconcileApplication } from "@/lib/cross-doc-reconcile/reconcile-application";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAGE = 1000;

/**
 * One-time / admin: clear AUTO_RECON flag_note rows, then re-run reconciliation per application.
 * POST with header Authorization: Bearer <RECON_ADMIN_SECRET> (same value as env RECON_ADMIN_SECRET).
 */
export async function POST(req: Request) {
  const secret = process.env.RECON_ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "RECON_ADMIN_SECRET is not configured." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const failed: { application_id: string; error: string }[] = [];

  try {
    const idSet = new Set<string>();
    let from = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("extracted_fields")
        .select("application_id")
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message, processed: 0, failed: [] },
          { status: 500 },
        );
      }
      const rows = data ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        const id = String((r as { application_id?: string }).application_id ?? "").trim();
        if (id) idSet.add(id);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    const { error: clearErr } = await supabaseAdmin
      .from("extracted_fields")
      .update({ is_flagged: false, flag_note: "" })
      .like("flag_note", "AUTO_RECON%");
    if (clearErr) {
      return NextResponse.json(
        { ok: false, error: clearErr.message, processed: 0, failed: [] },
        { status: 500 },
      );
    }

    const ids = [...idSet];
    for (const application_id of ids) {
      const result = await reconcileApplication(application_id);
      if (!result.ok) {
        failed.push({
          application_id,
          error: result.error ?? "unknown",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: ids.length,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, processed: 0, failed },
      { status: 500 },
    );
  }
}
