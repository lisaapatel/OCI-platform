import { NextResponse } from "next/server";

import { ociParentRequirementMet } from "@/lib/oci-new-checklist";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Application } from "@/lib/types";

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
      archived?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return NextResponse.json(
          { error: "Invalid archived value." },
          { status: 400 }
        );
      }
      patch.archived_at = body.archived ? new Date().toISOString() : null;
    }
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
        { error: "Provide status, notes, and/or archived." },
        { status: 400 }
      );
    }

    if (body.status === "ready_to_submit") {
      const { data: appRow } = await supabaseAdmin
        .from("applications")
        .select("service_type")
        .eq("id", id)
        .maybeSingle();
      const st = appRow?.service_type as Application["service_type"] | undefined;
      if (st === "oci_new" || st === "oci_renewal") {
        const { data: docs, error: docErr } = await supabaseAdmin
          .from("documents")
          .select("doc_type")
          .eq("application_id", id);
        if (docErr) {
          return NextResponse.json(
            { error: `Could not verify documents: ${docErr.message}` },
            { status: 500 }
          );
        }
        const present = new Set(
          (docs ?? []).map((d) => String(d.doc_type ?? "").trim()).filter(Boolean),
        );
        if (!ociParentRequirementMet(present)) {
          return NextResponse.json(
            {
              error:
                "OCI applications require at least one parent document: upload Parent's Indian Passport or Parent's OCI card before Ready to Submit.",
            },
            { status: 400 }
          );
        }
      }
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
