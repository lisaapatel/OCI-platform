import { NextResponse } from "next/server";

import { getDriveFileMetadata } from "@/lib/google-drive";
import { PORTAL_MAX_BYTES } from "@/lib/portal-constants";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function isReadyForPortal(row: {
  size_bytes: number | null;
  compressed_size_bytes: number | null;
}): boolean {
  if (row.size_bytes != null && row.size_bytes <= PORTAL_MAX_BYTES) return true;
  if (
    row.compressed_size_bytes != null &&
    row.compressed_size_bytes <= PORTAL_MAX_BYTES
  )
    return true;
  return false;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const application_id = url.searchParams.get("application_id")?.trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id query param is required." },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from("documents")
      .select(
        "id, file_name, drive_file_id, drive_view_url, compressed_drive_file_id, compressed_drive_url, compressed_size_bytes"
      )
      .eq("application_id", application_id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows ?? [];
    const enriched = await Promise.all(
      list.map(async (row) => {
        const driveFileId = String(row.drive_file_id ?? "").trim();
        if (!driveFileId) {
          return {
            ...row,
            size_bytes: null as number | null,
            mime_type: null as string | null,
            meta_error: "missing_drive_file_id",
            ready_for_portal: false,
          };
        }
        try {
          const meta = await getDriveFileMetadata(driveFileId);
          const size_bytes = meta.size;
          const mime_type = meta.mimeType;
          const ready_for_portal = isReadyForPortal({
            size_bytes,
            compressed_size_bytes:
              row.compressed_size_bytes != null
                ? Number(row.compressed_size_bytes)
                : null,
          });
          return {
            ...row,
            size_bytes,
            mime_type,
            meta_error: null as string | null,
            ready_for_portal,
          };
        } catch {
          return {
            ...row,
            size_bytes: null as number | null,
            mime_type: null as string | null,
            meta_error: "drive_metadata_failed",
            ready_for_portal: false,
          };
        }
      })
    );

    const readyCount = enriched.filter((d) => d.ready_for_portal).length;

    return NextResponse.json(
      {
        documents: enriched,
        summary: {
          ready: readyCount,
          total: enriched.length,
        },
      },
        { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
