import { NextResponse } from "next/server";

import { getGoogleAccessToken } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Streams a Drive file for an application document so the browser can save it locally.
 * Query: application_id, drive_file_id
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const application_id = url.searchParams.get("application_id")?.trim() ?? "";
    const drive_file_id = url.searchParams.get("drive_file_id")?.trim() ?? "";

    if (!application_id || !drive_file_id) {
      return NextResponse.json(
        { error: "application_id and drive_file_id are required." },
        { status: 400 }
      );
    }

    const { data: rows, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, drive_file_id, fixed_drive_file_id")
      .eq("application_id", application_id);

    if (docErr || !rows?.length) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const doc = rows.find(
      (r) =>
        r.drive_file_id === drive_file_id || r.fixed_drive_file_id === drive_file_id
    );

    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const fetchId = drive_file_id;

    const token = await getGoogleAccessToken();
    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fetchId
    )}?alt=media`;

    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Drive download failed: ${res.status} ${text}` },
        { status: 502 }
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const requestedName = url.searchParams.get("filename")?.trim();
    const safeName =
      (requestedName && requestedName.replace(/[^\w.\-]+/g, "_")) ||
      String(doc.file_name ?? "download").replace(/[^\w.\-]+/g, "_") ||
      "file.jpg";

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
