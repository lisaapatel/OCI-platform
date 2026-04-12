import { NextResponse } from "next/server";
import sharp from "sharp";

import { standalonePhotoDriveName } from "@/lib/drive-file-naming";
import { validateGovtImage } from "@/lib/govt-photo-signature";
import {
  findOrCreateChildFolder,
  uploadFileToDrive,
} from "@/lib/google-drive";
import { PASSPORT_RENEWAL_PHOTO_SPECS } from "@/lib/passport-photo-specs";
import { validatePassportRenewalPhoto } from "@/lib/passport-renewal-photo-validate";
import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";
import {
  isStandalonePhotoCategoryId,
  standalonePhotoCategoryDriveFolder,
} from "@/lib/standalone-photo-categories";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function decodeBase64Image(raw: string): Buffer {
  const s = raw.trim();
  const idx = s.indexOf("base64,");
  const b64 =
    idx >= 0 ? s.slice(idx + "base64,".length).replace(/\s/g, "") : s.replace(/\s/g, "");
  return Buffer.from(b64, "base64");
}

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 100) / 100;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      image_base64?: string;
      image_type?: string;
      category?: string;
      client_label?: string | null;
    };

    const image_base64 = String(body.image_base64 ?? "").trim();
    const client_label = String(body.client_label ?? "").trim() || null;
    const image_type = String(body.image_type ?? "").trim() as
      | "photo"
      | "signature";
    const categoryRaw = String(body.category ?? "").trim();

    if (!image_base64) {
      return NextResponse.json(
        { error: "image_base64 is required." },
        { status: 400 }
      );
    }

    if (image_type !== "photo" && image_type !== "signature") {
      return NextResponse.json(
        { error: "image_type must be 'photo' or 'signature'." },
        { status: 400 }
      );
    }

    if (!isStandalonePhotoCategoryId(categoryRaw)) {
      return NextResponse.json(
        { error: "category must be 'oci' or 'indian_passport'." },
        { status: 400 }
      );
    }

    const category = categoryRaw;
    const buf = decodeBase64Image(image_base64);

    if (image_type === "photo" && category === "indian_passport") {
      const maxB = PASSPORT_RENEWAL_PHOTO_SPECS.maxSizeKB * 1024;
      if (buf.length > maxB) {
        return NextResponse.json(
          {
            error: `Image is ${kb(buf.length)}KB; max is ${kb(maxB)}KB.`,
          },
          { status: 400 }
        );
      }
      const pv = await validatePassportRenewalPhoto(buf);
      if (!pv.valid) {
        return NextResponse.json(
          {
            error:
              pv.issues[0] ??
              "Photo does not meet Indian passport renewal requirements.",
          },
          { status: 400 }
        );
      }
    } else if (image_type === "photo") {
      if (buf.length > PORTAL_IMAGE_MAX_BYTES) {
        return NextResponse.json(
          {
            error: `Image is ${kb(buf.length)}KB; max is ${kb(PORTAL_IMAGE_MAX_BYTES)}KB.`,
          },
          { status: 400 }
        );
      }
      const v = await validateGovtImage(buf, "photo");
      if (!v.valid) {
        return NextResponse.json(
          { error: v.issues[0] ?? "Photo does not meet OCI requirements." },
          { status: 400 }
        );
      }
    } else {
      if (buf.length > PORTAL_IMAGE_MAX_BYTES) {
        return NextResponse.json(
          {
            error: `Image is ${kb(buf.length)}KB; max is ${kb(PORTAL_IMAGE_MAX_BYTES)}KB.`,
          },
          { status: 400 }
        );
      }
      const v = await validateGovtImage(buf, "signature");
      if (!v.valid) {
        return NextResponse.json(
          {
            error: v.issues[0] ?? "Signature does not meet OCI requirements.",
          },
          { status: 400 }
        );
      }
    }

    const meta = await sharp(buf, { failOn: "none" }).metadata();
    if (meta.format && meta.format !== "jpeg") {
      return NextResponse.json(
        { error: "Image must be JPEG." },
        { status: 400 }
      );
    }

    const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
    if (!rootId) {
      return NextResponse.json(
        { error: "GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured." },
        { status: 500 }
      );
    }

    const photosFolderId = await findOrCreateChildFolder(rootId, "Photos");
    const categoryFolderName = standalonePhotoCategoryDriveFolder(category);
    const categoryFolderId = await findOrCreateChildFolder(
      photosFolderId,
      categoryFolderName
    );

    const fileName = standalonePhotoDriveName(image_type, client_label);
    const uploaded = await uploadFileToDrive(
      buf,
      fileName,
      "image/jpeg",
      categoryFolderId
    );

    return NextResponse.json(
      {
        ok: true,
        drive_url: uploaded.url,
        file_name: fileName,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
