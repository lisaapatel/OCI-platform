"use client";

import { useCallback, useState } from "react";

import { PhotoCropEditorModal } from "@/components/photo-crop-editor-modal";
import { SignatureCropEditorModal } from "@/components/signature-crop-editor-modal";
import {
  OCI_APPLICANT_PHOTO_EXPORT_PX,
  OCI_APPLICANT_PHOTO_MAX_PX,
  OCI_APPLICANT_PHOTO_MIN_PX,
  OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX,
} from "@/lib/oci-applicant-photo-rules";
import {
  OCI_APPLICANT_SIGNATURE_EXPORT_HEIGHT_PX,
  OCI_APPLICANT_SIGNATURE_EXPORT_WIDTH_PX,
  OCI_APPLICANT_SIGNATURE_MAX_HEIGHT_PX,
  OCI_APPLICANT_SIGNATURE_MAX_WIDTH_PX,
  OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX,
  OCI_APPLICANT_SIGNATURE_MIN_WIDTH_PX,
} from "@/lib/oci-applicant-signature-rules";
import {
  PASSPORT_RENEWAL_EXPORT_PX,
  PASSPORT_RENEWAL_PHOTO_SPECS,
} from "@/lib/passport-photo-specs";
import { PORTAL_IMAGE_MAX_BYTES, PORTAL_IMAGE_MAX_KB } from "@/lib/portal-constants";
import type { StandalonePhotoCategoryId } from "@/lib/standalone-photo-categories";

type RecentSave = { url: string; file: string; at: string };

function EditorBenchmarks({ category }: { category: StandalonePhotoCategoryId }) {
  const isOci = category === "oci";
  const P = PASSPORT_RENEWAL_PHOTO_SPECS;

  return (
    <section
      className="mt-6 rounded-xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm"
      aria-labelledby="editor-benchmarks-heading"
    >
      <h2
        id="editor-benchmarks-heading"
        className="text-sm font-semibold text-slate-900"
      >
        Editor benchmarks (matches the crop tools)
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Numbers below are imported from the same rule modules as the editors, so
        they match the crop frame, export size, and the green checklist in the
        modal for the category you selected.
      </p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Applicant photo
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-snug text-slate-800">
            {isOci ? (
              <>
                <li>
                  Crop overlay: <strong>square 1:1</strong>
                </li>
                <li>
                  Square check: width and height may differ by at most{" "}
                  <strong>±{OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX}px</strong>{" "}
                  (same as OCI portal validation).
                </li>
                <li>
                  Exported JPEG dimensions:{" "}
                  <strong>
                    {OCI_APPLICANT_PHOTO_EXPORT_PX}×{OCI_APPLICANT_PHOTO_EXPORT_PX}
                    px
                  </strong>{" "}
                  (the editor scales your crop to this square).
                </li>
                <li>
                  Validated pixel range after export:{" "}
                  <strong>
                    {OCI_APPLICANT_PHOTO_MIN_PX}×{OCI_APPLICANT_PHOTO_MIN_PX}px
                  </strong>{" "}
                  through{" "}
                  <strong>
                    {OCI_APPLICANT_PHOTO_MAX_PX}×{OCI_APPLICANT_PHOTO_MAX_PX}px
                  </strong>
                  .
                </li>
                <li>
                  JPEG file size: <strong>at most {PORTAL_IMAGE_MAX_KB}KB</strong>{" "}
                  ({PORTAL_IMAGE_MAX_BYTES.toLocaleString()} bytes).
                </li>
              </>
            ) : (
              <>
                <li>
                  Crop overlay: <strong>square 1:1</strong> (
                  {P.aspectRatio.width}:{P.aspectRatio.height})
                </li>
                <li>
                  Square check: up to{" "}
                  <strong>±{P.squareTolerancePx}px</strong> width vs height.
                </li>
                <li>
                  Exported JPEG dimensions:{" "}
                  <strong>
                    {PASSPORT_RENEWAL_EXPORT_PX}×{PASSPORT_RENEWAL_EXPORT_PX}px
                  </strong>{" "}
                  (editor export; must still fall within the min/max range below).
                </li>
                <li>
                  Validated pixel range:{" "}
                  <strong>
                    {P.minWidth}×{P.minHeight}px
                  </strong>{" "}
                  through{" "}
                  <strong>
                    {P.maxWidth}×{P.maxHeight}px
                  </strong>
                  .
                </li>
                <li>
                  JPEG file size:{" "}
                  <strong>
                    {P.minSizeKB}–{P.maxSizeKB}KB
                  </strong>{" "}
                  (editor targets this band).
                </li>
                <li>
                  <strong>{P.faceCoverageNote}</strong>;{" "}
                  <strong>{P.backgroundNote}</strong> — you confirm background in
                  the editor checklist.
                </li>
              </>
            )}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Signature
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Both categories use the <strong>OCI portal</strong> signature editor
            and limits (same as application flow).
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-snug text-slate-800">
            <li>
              Crop overlay: <strong>3:1</strong> width to height (wide
              signature box).
            </li>
            <li>
              Ratio check: within about <strong>±2%</strong> of an exact 3:1
              ratio (same tolerance as server validation).
            </li>
            <li>
              Exported JPEG dimensions:{" "}
              <strong>
                {OCI_APPLICANT_SIGNATURE_EXPORT_WIDTH_PX}×
                {OCI_APPLICANT_SIGNATURE_EXPORT_HEIGHT_PX}px
              </strong>
              .
            </li>
            <li>
              Validated pixel range:{" "}
              <strong>
                {OCI_APPLICANT_SIGNATURE_MIN_WIDTH_PX}×
                {OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX}px
              </strong>{" "}
              through{" "}
              <strong>
                {OCI_APPLICANT_SIGNATURE_MAX_WIDTH_PX}×
                {OCI_APPLICANT_SIGNATURE_MAX_HEIGHT_PX}px
              </strong>
              .
            </li>
            <li>
              JPEG file size: <strong>at most {PORTAL_IMAGE_MAX_KB}KB</strong>{" "}
              ({PORTAL_IMAGE_MAX_BYTES.toLocaleString()} bytes).
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function base64JpegToObjectUrl(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/jpeg" });
  return URL.createObjectURL(blob);
}

export default function StandalonePhotosPage() {
  const [category, setCategory] = useState<StandalonePhotoCategoryId>("oci");
  const [clientLabel, setClientLabel] = useState("");
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const [sigBlobUrl, setSigBlobUrl] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [sigPreviewUrl, setSigPreviewUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentSave[]>([]);

  const clearPhotoPreview = useCallback(() => {
    setPhotoPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const clearSigPreview = useCallback(() => {
    setSigPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const closePhoto = useCallback(() => {
    setPhotoOpen(false);
    setPhotoBlobUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const closeSig = useCallback(() => {
    setSigOpen(false);
    setSigBlobUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const onPhotoFile = useCallback(
    (file: File | null) => {
      if (!file || !file.type.startsWith("image/")) return;
      setError(null);
      setSuccess(null);
      clearPhotoPreview();
      setPhotoBlobUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setPhotoOpen(true);
    },
    [clearPhotoPreview]
  );

  const onSigFile = useCallback(
    (file: File | null) => {
      if (!file || !file.type.startsWith("image/")) return;
      setError(null);
      setSuccess(null);
      clearSigPreview();
      setSigBlobUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setSigOpen(true);
    },
    [clearSigPreview]
  );

  const handlePhotoPreview = useCallback(
    async (b64: string) => {
      clearPhotoPreview();
      const url = base64JpegToObjectUrl(b64);
      setPhotoPreviewUrl(url);
      setSuccess(
        "Photo preview saved in this session — compare below, or use Download / Save to Drive in the editor."
      );
    },
    [clearPhotoPreview]
  );

  const handleSigPreview = useCallback(
    async (b64: string) => {
      clearSigPreview();
      const url = base64JpegToObjectUrl(b64);
      setSigPreviewUrl(url);
      setSuccess(
        "Signature preview saved in this session — compare below, or use Download / Save to Drive in the editor."
      );
    },
    [clearSigPreview]
  );

  const savePhoto = useCallback(
    async (image_base64: string) => {
      const res = await fetch("/api/photos/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64,
          image_type: "photo",
          category,
          client_label: clientLabel.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        drive_url?: string;
        file_name?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSuccess(`Saved to Drive: ${data.file_name ?? "photo"}`);
      if (data.drive_url && data.file_name) {
        setRecent((r) =>
          [
            {
              url: data.drive_url!,
              file: data.file_name!,
              at: new Date().toISOString(),
            },
            ...r,
          ].slice(0, 12)
        );
      }
    },
    [category, clientLabel]
  );

  const saveSig = useCallback(
    async (image_base64: string) => {
      const res = await fetch("/api/photos/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64,
          image_type: "signature",
          category,
          client_label: clientLabel.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        drive_url?: string;
        file_name?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSuccess(`Saved to Drive: ${data.file_name ?? "signature"}`);
      if (data.drive_url && data.file_name) {
        setRecent((r) =>
          [
            {
              url: data.drive_url!,
              file: data.file_name!,
              at: new Date().toISOString(),
            },
            ...r,
          ].slice(0, 12)
        );
      }
    },
    [category, clientLabel]
  );

  const photoToolbar = {
    clientLabel,
    onClientLabelChange: setClientLabel,
    onPreview: handlePhotoPreview,
  };

  const sigToolbar = {
    clientLabel,
    onClientLabelChange: setClientLabel,
    onPreview: handleSigPreview,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Photo editing</h1>
      <p className="mt-2 text-sm text-slate-600">
        Crop and export applicant photos or signatures using the same editor as
        on an application. Use{" "}
        <span className="font-medium">Save preview</span> to lock in the current
        crop without uploading, then <span className="font-medium">Download</span>{" "}
        or <span className="font-medium">Save to Drive</span>. Optional{" "}
        <span className="font-medium">Client</span> is included in filenames. Drive
        output lives under <span className="font-medium">Photos</span> / your
        category folder.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="photo-category" className="text-sm font-medium text-slate-800">
          Category
        </label>
        <select
          id="photo-category"
          className="max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as StandalonePhotoCategoryId)
          }
        >
          <option value="oci">OCI</option>
          <option value="indian_passport">Indian passport renewal</option>
        </select>
        <p className="text-xs text-slate-500">
          {category === "oci"
            ? "Photo checks follow OCI portal rules (JPEG, size, square crop)."
            : "Photo checks follow Indian passport renewal / VFS rules (including file size band and white background confirmation in the editor)."}
        </p>
      </div>

      <EditorBenchmarks category={category} />

      {success ? (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Applicant photo</h2>
          <p className="mt-1 text-xs text-slate-600">
            Upload an image, then preview, download, or save to Drive from the
            editor.
          </p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-100">
            <span className="font-medium text-[#1e3a5f]">Choose photo</span>
            <span className="mt-1 text-xs">JPEG / PNG / HEIC etc.</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                onPhotoFile(f);
              }}
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Signature</h2>
          <p className="mt-1 text-xs text-slate-600">
            Same 3:1 signature editor as OCI applications. Preview, download, or
            save to Drive from the editor.
          </p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-100">
            <span className="font-medium text-[#1e3a5f]">Choose signature image</span>
            <span className="mt-1 text-xs">Scan or photo of signature on white</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                onSigFile(f);
              }}
            />
          </label>
        </div>
      </div>

      {photoPreviewUrl || sigPreviewUrl ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {photoPreviewUrl ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">
                Last photo preview
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                From “Save preview” in the editor. Not uploaded until you use Save
                to Drive.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreviewUrl}
                alt="Cropped photo preview"
                className="mt-3 max-h-72 w-auto rounded-lg border border-slate-200 object-contain"
              />
            </div>
          ) : null}
          {sigPreviewUrl ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">
                Last signature preview
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                From “Save preview” in the editor. Not uploaded until you use Save
                to Drive.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sigPreviewUrl}
                alt="Cropped signature preview"
                className="mt-3 max-h-40 w-full max-w-md rounded-lg border border-slate-200 object-contain"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-10">
          <h3 className="text-sm font-semibold text-slate-800">Saved this session</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {recent.map((row) => (
              <li key={`${row.file}-${row.at}`}>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563eb] hover:underline"
                >
                  {row.file}
                </a>
                <span className="ml-2 text-xs text-slate-500">{row.at}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PhotoCropEditorModal
        open={photoOpen}
        onClose={closePhoto}
        imageSrc={photoBlobUrl ?? undefined}
        photoSpecs={
          category === "indian_passport"
            ? PASSPORT_RENEWAL_PHOTO_SPECS
            : undefined
        }
        standaloneClientToolbar={photoToolbar}
        onSave={async (b64) => {
          setError(null);
          try {
            await savePhoto(b64);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            throw e;
          }
        }}
      />

      <SignatureCropEditorModal
        open={sigOpen}
        onClose={closeSig}
        imageSrc={sigBlobUrl ?? undefined}
        standaloneClientToolbar={sigToolbar}
        onSave={async (b64) => {
          setError(null);
          try {
            await saveSig(b64);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            throw e;
          }
        }}
      />
    </div>
  );
}
