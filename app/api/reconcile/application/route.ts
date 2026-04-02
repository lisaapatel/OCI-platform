import { NextResponse } from "next/server";

import { reconcileApplication } from "@/lib/cross-doc-reconcile/reconcile-application";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { application_id?: string };
    const application_id = String(body.application_id ?? "").trim();
    if (!application_id) {
      return NextResponse.json(
        { ok: false, error: "application_id is required." },
        { status: 400 },
      );
    }

    const result = await reconcileApplication(application_id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Reconciliation failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      fields: result.fields ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
