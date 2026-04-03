import { NextResponse } from "next/server";

import {
  type GovtImageType,
  validateGovtImage,
} from "@/lib/govt-photo-signature";
import { getFileAsBase64 } from "@/lib/google-drive";
import { validatePassportRenewalPhoto } from "@/lib/passport-renewal-photo-validate";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Application } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DOC_BY_TYPE: Record<GovtImageType, string> = {
  photo: "applicant_photo",
  signature: "applicant_signature",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      application_id?: string;
      drive_file_id?: string;
      image_type?: string;
      imageType?: string;
    };

    const application_id = String(body.application_id ?? "").trim();
    const drive_file_id = String(body.drive_file_id ?? "").trim();
    const image_type = String(
      body.image_type ?? body.imageType ?? ""
    ).trim() as GovtImageType;

    if (!application_id || !drive_file_id) {
      return NextResponse.json(
        { error: "application_id and drive_file_id are required." },
        { status: 400 }
      );
    }

    if (image_type !== "photo" && image_type !== "signature") {
      return NextResponse.json(
        { error: "image_type must be 'photo' or 'signature'." },
        { status: 400 }
      );
    }

    const expectedDocType = DOC_BY_TYPE[image_type];

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("id, doc_type, drive_file_id")
      .eq("application_id", application_id)
      .eq("drive_file_id", drive_file_id)
      .maybeSingle();

    if (docErr || !doc) {
      return NextResponse.json(
        { error: "Document not found for this application." },
        { status: 404 }
      );
    }

    if (String(doc.doc_type) !== expectedDocType) {
      return NextResponse.json(
        {
          error: `This file is registered as "${doc.doc_type}"; expected "${expectedDocType}" for ${image_type} validation.`,
        },
        { status: 400 }
      );
    }

    const { data: appMeta } = await supabaseAdmin
      .from("applications")
      .select("service_type")
      .eq("id", application_id)
      .maybeSingle();

    const serviceType =
      (appMeta?.service_type as Application["service_type"] | undefined) ??
      "oci_new";

    const b64 = await getFileAsBase64(drive_file_id);
    const buffer = Buffer.from(b64, "base64");

    const result =
      serviceType === "passport_renewal" && image_type === "photo"
        ? await validatePassportRenewalPhoto(buffer)
        : await validateGovtImage(buffer, image_type);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
