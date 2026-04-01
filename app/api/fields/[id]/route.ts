import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      field_value?: string | null;
      is_flagged?: boolean;
      flag_note?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (body.field_value !== undefined) patch.field_value = body.field_value;
    // is_flagged / flag_note: only updated when the client sends them (manual 🚩 on review).
    if (body.is_flagged !== undefined) patch.is_flagged = body.is_flagged;
    if (body.flag_note !== undefined) patch.flag_note = body.flag_note;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("extracted_fields")
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
