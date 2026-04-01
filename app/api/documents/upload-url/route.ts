import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";
const STORAGE_FILE_SIZE_LIMIT =
  process.env.SUPABASE_STORAGE_FILE_SIZE_LIMIT ?? "52428800"; // 50MB default

function parseSizeToBytes(input: string): number {
  const raw = input.trim().toUpperCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(\d+)(B|KB|MB|GB)$/);
  if (!m) return 52_428_800;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "B") return n;
  if (unit === "KB") return n * 1024;
  if (unit === "MB") return n * 1024 * 1024;
  return n * 1024 * 1024 * 1024;
}

const STORAGE_FILE_SIZE_LIMIT_BYTES = parseSizeToBytes(STORAGE_FILE_SIZE_LIMIT);

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureBucketExists() {
  const { data: bucket, error } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
  if (!error) {
    // Best-effort align the limit on existing buckets; never block uploads on update failure.
    const { error: updateError } = await supabaseAdmin.storage.updateBucket(
      STORAGE_BUCKET,
      {
        public: true,
        fileSizeLimit: STORAGE_FILE_SIZE_LIMIT_BYTES,
      }
    );
    if (updateError) {
      console.error("Could not update storage bucket fileSizeLimit", {
        bucket: STORAGE_BUCKET,
        desiredLimitBytes: STORAGE_FILE_SIZE_LIMIT_BYTES,
        currentLimit: (bucket as { file_size_limit?: number } | null)?.file_size_limit,
        message: updateError.message,
      });
    }
    return;
  }

  const message = error.message.toLowerCase();
  if (!message.includes("not found")) throw error;

  const { error: createError } = await supabaseAdmin.storage.createBucket(
    STORAGE_BUCKET,
    {
      public: true,
      fileSizeLimit: STORAGE_FILE_SIZE_LIMIT_BYTES,
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
      file_size?: number;
    };

    const application_id = String(body.application_id ?? "").trim();
    const doc_type = String(body.doc_type ?? "").trim();
    const file_name = String(body.file_name ?? "").trim();
    const file_size = Number(body.file_size ?? 0);

    if (!application_id || !doc_type || !file_name) {
      return NextResponse.json(
        { error: "application_id, doc_type, and file_name are required." },
        { status: 400 }
      );
    }

    if (Number.isFinite(file_size) && file_size > STORAGE_FILE_SIZE_LIMIT_BYTES) {
      return NextResponse.json(
        {
          error: `File is too large (${file_size} bytes). Current configured limit is ${STORAGE_FILE_SIZE_LIMIT_BYTES} bytes.`,
        },
        { status: 413 }
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
        file_size_limit: STORAGE_FILE_SIZE_LIMIT_BYTES,
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
