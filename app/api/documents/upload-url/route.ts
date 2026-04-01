import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureBucketExists() {
  const { error } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
  if (!error) return;
  const message = error.message.toLowerCase();
  if (!message.includes("not found")) throw error;

  const { error: createError } = await supabaseAdmin.storage.createBucket(
    STORAGE_BUCKET,
    {
      public: true,
      fileSizeLimit: "100MB",
    }
  );
  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      doc_type?: string;
      file_name?: string;
    };

    const application_id = String(body.application_id ?? "").trim();
    const doc_type = String(body.doc_type ?? "").trim();
    const file_name = String(body.file_name ?? "").trim();

    if (!application_id || !doc_type || !file_name) {
      return NextResponse.json(
        { error: "application_id, doc_type, and file_name are required." },
        { status: 400 }
      );
    }

    await ensureBucketExists();

    const safeName = sanitizeFileName(file_name);
    const objectPath = `${application_id}/${doc_type}/${Date.now()}-${safeName}`;

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(objectPath);

    if (error || !data?.token) {
      return NextResponse.json(
        {
          error: `Failed to create signed upload URL: ${
            error?.message ?? "Unknown error"
          }`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        bucket: STORAGE_BUCKET,
        path: objectPath,
        token: data.token,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
