"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import clsx from "clsx";
import ReactCrop, {
  centerCrop,
  convertToPercentCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";
import type { Document } from "@/lib/types";

import styles from "./photo-crop-editor-modal.module.css";

let faceApiLoadPromise: Promise<void> | null = null;

function ensureFaceApiLoaded(): Promise<void> {
  if (!faceApiLoadPromise) {
    faceApiLoadPromise = import("face-api.js").then(async (faceapi) => {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
    });
  }
  return faceApiLoadPromise;
}

function initialSquareCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 80 }, 1, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

function drawRotatedToCanvas(
  img: HTMLImageElement,
  deg: number
): HTMLCanvasElement {
  const rad = (deg * Math.PI) / 180;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const Rw = Math.max(1, Math.ceil(w * cos + h * sin));
  const Rh = Math.max(1, Math.ceil(w * sin + h * cos));
  const canvas = document.createElement("canvas");
  canvas.width = Rw;
  canvas.height = Rh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.translate(Rw / 2, Rh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Failed to encode image");
  return URL.createObjectURL(blob);
}

async function compressCanvasToLimit(
  canvas: HTMLCanvasElement,
  maxBytes: number
): Promise<Blob> {
  let q = 0.85;
  for (let i = 0; i < 18; i++) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", q)
    );
    if (!blob) throw new Error("toBlob failed");
    if (blob.size <= maxBytes) return blob;
    q -= 0.05;
    if (q < 0.28) q = 0.28;
  }
  const last = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.28)
  );
  if (last && last.size <= maxBytes * 1.02) return last;
  throw new Error(
    `Could not compress under portal limit (${Math.round(maxBytes / 1024)}KB).`
  );
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function exportCroppedToCanvas(
  source: HTMLCanvasElement,
  pixelCrop: PixelCrop
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = 600;
  out.height = 600;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    source,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    600,
    600
  );
  return out;
}

export type PhotoCropEditorModalProps = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  document: Document | null;
  onSaved: () => void | Promise<void>;
};

export function PhotoCropEditorModal({
  open,
  onClose,
  applicationId,
  document: doc,
  onSaved,
}: PhotoCropEditorModalProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceObjectUrl, setSourceObjectUrl] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [crop, setCrop] = useState<Crop>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKb, setPreviewKb] = useState<string>("—");
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceHint, setFaceHint] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const displayImgRef = useRef<HTMLImageElement | null>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const revokeUrls = useRef<string[]>([]);

  const pushRevoke = (u: string) => {
    revokeUrls.current.push(u);
  };

  const cleanupUrls = useCallback(() => {
    for (const u of revokeUrls.current) {
      URL.revokeObjectURL(u);
    }
    revokeUrls.current = [];
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !doc?.drive_file_id) return;

    let cancelled = false;
    setLoadError(null);
    setFaceHint(null);
    setRotationDeg(0);
    setCrop(undefined);
    setPreviewUrl(null);
    setPreviewKb("—");
    cleanupUrls();
    setSourceObjectUrl(null);
    setDisplayUrl(null);
    rotatedCanvasRef.current = null;
    sourceImgRef.current = null;

    const dl = `/api/documents/download?application_id=${encodeURIComponent(applicationId)}&drive_file_id=${encodeURIComponent(doc.drive_file_id)}&filename=${encodeURIComponent(doc.file_name || "photo.jpg")}`;

    void (async () => {
      try {
        const res = await fetch(dl);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Download failed (${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        const ou = URL.createObjectURL(blob);
        pushRevoke(ou);
        setSourceObjectUrl(ou);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, doc, applicationId, cleanupUrls]);

  const rebuildRotatedDisplay = useCallback(
    (img: HTMLImageElement, deg: number) => {
      const canvas = drawRotatedToCanvas(img, deg);
      rotatedCanvasRef.current = canvas;
      void canvasToObjectUrl(canvas).then((url) => {
        setDisplayUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return url;
        });
        pushRevoke(url);
      });
    },
    []
  );

  const onSourceImageLoad = useCallback(() => {
    const img = sourceImgRef.current;
    if (!img?.naturalWidth) return;
    rebuildRotatedDisplay(img, rotationDeg);
  }, [rebuildRotatedDisplay, rotationDeg]);

  useEffect(() => {
    const img = sourceImgRef.current;
    if (!img?.naturalWidth || !sourceObjectUrl) return;
    rebuildRotatedDisplay(img, rotationDeg);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotation-only refresh
  }, [rotationDeg, sourceObjectUrl, rebuildRotatedDisplay]);

  const onDisplayImageLoad = useCallback(() => {
    const el = displayImgRef.current;
    if (!el?.naturalWidth) return;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    const ic = initialSquareCrop(w, h);
    setCrop(ic);
  }, []);

  const updatePreview = useCallback(async () => {
    const src = rotatedCanvasRef.current;
    const img = displayImgRef.current;
    const c = crop;
    if (!src || !img?.naturalWidth || !c?.width) {
      setPreviewUrl(null);
      setPreviewKb("—");
      return;
    }
    const pixel = convertToPixelCrop(c, img.naturalWidth, img.naturalHeight);
    const cropped = exportCroppedToCanvas(src, pixel);
    const prev = document.createElement("canvas");
    prev.width = 150;
    prev.height = 150;
    const pctx = prev.getContext("2d");
    if (!pctx) return;
    pctx.drawImage(cropped, 0, 0, 150, 150);
    const blob = await new Promise<Blob | null>((resolve) =>
      prev.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    if (!blob) return;
    setPreviewKb((blob.size / 1024).toFixed(1));
    const pu = URL.createObjectURL(blob);
    setPreviewUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return pu;
    });
  }, [crop]);

  useEffect(() => {
    if (!open || !displayUrl) return;
    const t = window.setTimeout(() => {
      void updatePreview();
    }, 120);
    return () => clearTimeout(t);
  }, [open, displayUrl, crop, updatePreview]);

  const runFaceCenter = useCallback(async () => {
    const img = displayImgRef.current;
    if (!img?.naturalWidth) return;
    setFaceBusy(true);
    setFaceHint(null);
    try {
      await ensureFaceApiLoaded();
      const faceapi = await import("face-api.js");
      const faces = await faceapi.detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.45,
        })
      );
      if (!faces.length) {
        setFaceHint("Could not detect face — position manually");
        return;
      }
      const best = faces.reduce((a, b) =>
        a.box.width * a.box.height > b.box.width * b.box.height ? a : b
      );
      const { x, y, width, height } = best.box;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const Rw = img.naturalWidth;
      const Rh = img.naturalHeight;
      const faceL = Math.max(width, height);
      let side = faceL / 0.65;
      side = Math.min(side, Math.min(Rw, Rh));
      side = Math.max(side, Math.min(Rw, Rh) * 0.15);
      let left = cx - side / 2;
      let top = cy - side / 2;
      left = Math.max(0, Math.min(left, Rw - side));
      top = Math.max(0, Math.min(top, Rh - side));
      const pc: PixelCrop = {
        unit: "px",
        x: left,
        y: top,
        width: side,
        height: side,
      };
      setCrop(convertToPercentCrop(pc, Rw, Rh));
      setFaceHint(null);
    } catch {
      setFaceHint("Could not detect face — position manually");
    } finally {
      setFaceBusy(false);
    }
  }, []);

  const buildFinalBlob = useCallback(async (): Promise<Blob> => {
    const src = rotatedCanvasRef.current;
    const img = displayImgRef.current;
    if (!src || !img?.naturalWidth || !crop?.width) {
      throw new Error("Image or crop not ready.");
    }
    const pixel = convertToPixelCrop(crop, img.naturalWidth, img.naturalHeight);
    const out = exportCroppedToCanvas(src, pixel);
    return compressCanvasToLimit(out, PORTAL_IMAGE_MAX_BYTES);
  }, [crop]);

  const onApplyDownload = useCallback(async () => {
    try {
      const blob = await buildFinalBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "applicant-photo-cropped.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [buildFinalBlob]);

  const onApplySave = useCallback(async () => {
    if (!doc) return;
    setSaveBusy(true);
    setLoadError(null);
    try {
      const blob = await buildFinalBlob();
      const buf = await blob.arrayBuffer();
      const b64 = uint8ToBase64(new Uint8Array(buf));
      const res = await fetch("/api/documents/fix-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          document_id: doc.id,
          image_type: "photo",
          image_base64: b64,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Save failed");
      }
      await onSaved();
      onClose();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }, [applicationId, doc, buildFinalBlob, onSaved, onClose]);

  const handleClose = useCallback(() => {
    cleanupUrls();
    setDisplayUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });
    setSourceObjectUrl(null);
    setLoadError(null);
    setFaceHint(null);
    onClose();
  }, [cleanupUrls, onClose]);

  if (!mounted || !open) return null;

  const portal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit applicant photo"
    >
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Edit applicant photo
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : null}

          {sourceObjectUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={sourceImgRef}
              src={sourceObjectUrl}
              alt=""
              className="hidden"
              onLoad={onSourceImageLoad}
            />
          ) : !loadError && open && doc ? (
            <p className="text-sm text-slate-600">Loading image…</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!displayUrl || faceBusy}
              onClick={() => void runFaceCenter()}
              className="rounded-lg border border-[#1e3a5f] bg-[#eff6ff] px-3 py-2 text-sm font-semibold text-[#1e3a5f] disabled:opacity-50"
            >
              {faceBusy ? "Detecting face…" : "Auto-center face"}
            </button>
            {faceHint ? (
              <span className="text-sm text-amber-800">{faceHint}</span>
            ) : null}
          </div>

          {displayUrl ? (
            <div className={clsx("mt-4 flex flex-col gap-4 lg:flex-row", styles.wrap)}>
              <div className="min-w-0 flex-1">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  aspect={1}
                  className="max-w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={displayImgRef}
                    src={displayUrl}
                    alt="Crop preview"
                    className="max-h-[min(60vh,560px)] w-auto max-w-full"
                    onLoad={onDisplayImageLoad}
                  />
                </ReactCrop>

                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-medium text-slate-700">
                      Rotation: {rotationDeg > 0 ? "+" : ""}
                      {rotationDeg}°
                    </label>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      value={rotationDeg}
                      onChange={(e) =>
                        setRotationDeg(Number(e.target.value))
                      }
                      className="w-48 max-w-full"
                    />
                    <button
                      type="button"
                      className="text-sm font-medium text-blue-700 hover:underline"
                      onClick={() => setRotationDeg(0)}
                    >
                      Reset rotation
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Export: 600×600px JPEG under portal limit (
                    {Math.round(PORTAL_IMAGE_MAX_BYTES / 1024)}KB).
                  </p>
                </div>
              </div>

              <div className="flex w-full flex-col items-center gap-2 lg:w-44 lg:shrink-0">
                <p className="text-center text-xs font-semibold text-slate-600">
                  Preview (govt portal view)
                </p>
                <div className="h-[150px] w-[150px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt="Preview"
                      width={150}
                      height={150}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      …
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-slate-500">
                  ~{previewKb} KB (preview quality)
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!displayUrl || !crop?.width}
            onClick={() => void onApplyDownload()}
            className="rounded-lg border border-[#1e3a5f] bg-white px-4 py-2 text-sm font-semibold text-[#1e3a5f] hover:bg-slate-50 disabled:opacity-50"
          >
            Apply &amp; Download
          </button>
          <button
            type="button"
            disabled={!displayUrl || !crop?.width || saveBusy}
            onClick={() => void onApplySave()}
            className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d4d73] disabled:opacity-50"
          >
            {saveBusy ? "Saving…" : "Apply & Save to Drive"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(portal, document.body);
}
