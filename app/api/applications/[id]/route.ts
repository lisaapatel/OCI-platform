import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

type Status =
  | "docs_pending"
  | "ready_for_review"
  | "ready_to_submit"
  | "submitted"
  | "on_hold";

const ALLOWED: Status[] = [
  "docs_pending",
  "ready_for_review",
  "ready_to_submit",
  "submitted",
  "on_hold",
];

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      status?: Status;
      notes?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!ALLOWED.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.notes !== undefined) {
      patch.notes = body.notes === null ? null : String(body.notes);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Provide status and/or notes." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("applications")
      .update(patch)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: `Update failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
}
