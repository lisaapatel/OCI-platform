import { NextResponse } from "next/server";

import {
  isOciServiceType,
  normalizeStoredOciIntakeVariant,
  parseOciIntakeVariantFromBody,
} from "@/lib/oci-intake-variant";
import { minorParentDocumentsMet } from "@/lib/parent-documents";
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
      is_minor?: boolean;
      oci_intake_variant?: string | null;
    };

    const patch: Record<string, unknown> = {};

    if ("oci_intake_variant" in body) {
      const parsed = parseOciIntakeVariantFromBody(body.oci_intake_variant);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const next = parsed.value;

      const { data: meta, error: metaErr } = await supabaseAdmin
        .from("applications")
        .select("service_type, oci_intake_variant")
        .eq("id", id)
        .maybeSingle();

      if (metaErr) {
        return NextResponse.json(
          { error: `Could not load application: ${metaErr.message}` },
          { status: 500 }
        );
      }
      if (!meta) {
        return NextResponse.json({ error: "Application not found." }, {
          status: 404,
        });
      }

      const st = meta.service_type as Application["service_type"];
      if (next !== null && !isOciServiceType(st)) {
        return NextResponse.json(
          {
            error:
              "oci_intake_variant is only valid for OCI applications (oci_new or oci_renewal).",
          },
          { status: 400 }
        );
      }

      const prev = normalizeStoredOciIntakeVariant(meta.oci_intake_variant);
      if (prev !== next) {
        const { count, error: countErr } = await supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("application_id", id);

        if (countErr) {
          return NextResponse.json(
            { error: `Could not verify documents: ${countErr.message}` },
            { status: 500 }
          );
        }
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            {
              error:
                "Cannot change oci_intake_variant after documents have been uploaded.",
            },
            { status: 400 }
          );
        }
      }

      patch.oci_intake_variant = next;
    }

    if (body.is_minor !== undefined) {
      if (typeof body.is_minor !== "boolean") {
        return NextResponse.json(
          { error: "is_minor must be a boolean." },
          { status: 400 }
        );
      }
      patch.is_minor = body.is_minor;
    }
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
        {
          error:
            "Provide status, notes, archived, is_minor, and/or oci_intake_variant.",
        },
        { status: 400 }
      );
    }

    if (body.status === "ready_to_submit") {
      const { data: appRow } = await supabaseAdmin
        .from("applications")
        .select("service_type, is_minor")
        .eq("id", id)
        .maybeSingle();
      const st = appRow?.service_type as Application["service_type"] | undefined;
      const effectiveMinor =
        body.is_minor !== undefined
          ? body.is_minor
          : appRow?.is_minor === true;

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

      if (effectiveMinor) {
        if (!minorParentDocumentsMet(present)) {
          return NextResponse.json(
            {
              error:
                "Minor applicants need at least one parent's passport or OCI card (father or mother slot) and Parent's Address Proof before Ready to Submit.",
            },
            { status: 400 }
          );
        }
      } else if (isOciServiceType(st)) {
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
