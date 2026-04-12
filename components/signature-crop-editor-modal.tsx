"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

import { standalonePhotoDriveName } from "@/lib/drive-file-naming";
import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";
import type { StandaloneCropClientToolbar } from "@/lib/standalone-photo-categories";
import type { Document } from "@/lib/types";
import {
  allOciApplicantSignatureChecksPass,
  evaluateOciApplicantSignatureExportBlob,
  OCI_APPLICANT_SIGNATURE_EXPORT_HEIGHT_PX,
  OCI_APPLICANT_SIGNATURE_EXPORT_WIDTH_PX,
  OCI_APPLICANT_SIGNATURE_MAX_HEIGHT_PX,
  OCI_APPLICANT_SIGNATURE_MAX_WIDTH_PX,
  OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX,
  OCI_APPLICANT_SIGNATURE_MIN_WIDTH_PX,
  OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX as _unusedMinH,
} from "@/lib/oci-applicant-signature-rules";

import styles from "./photo-crop-editor-modal.module.css";

const EXPORT_W = OCI_APPLICANT_SIGNATURE_EXPORT_WIDTH_PX;
const EXPORT_H = OCI_APPLICANT_SIGNATURE_EXPORT_HEIGHT_PX;
const PORTAL_MAX_KB = Math.round(PORTAL_IMAGE_MAX_BYTES / 1024);

async function canvasToObjectUrl(
  canvas: HTMLCanvasElement
): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Failed to encode image");
  return URL.createObjectURL(blob);
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
  if (last && last.size <= maxBytes) return last;
  throw new Error(`Could not compress under portal limit`);
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
  out.width = EXPORT_W;
  out.height = EXPORT_H;
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
    EXPORT_W,
    EXPORT_H
  );
  return out;
}

function applyCanvasFilters(
  src: HTMLCanvasElement,
  brightness: number,
  contrast: number
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  return out;
}

const SIG_THIRD = 100 / 3;
const SIG_GRID_STROKE = "rgba(30, 58, 95, 0.62)";
const SIG_GRID_DASH = "2.5 2.5";
const SIG_RECT_STROKE = "rgba(30, 64, 175, 0.58)";
const SIG_CENTER_STROKE = "rgba(51, 65, 85, 0.72)";

function SignatureAreaOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        x1={SIG_THIRD}
        y1="0"
        x2={SIG_THIRD}
        y2="100"
        stroke={SIG_GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={SIG_GRID_DASH}
      />
      <line
        x1={SIG_THIRD * 2}
        y1="0"
        x2={SIG_THIRD * 2}
        y2="100"
        stroke={SIG_GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={SIG_GRID_DASH}
      />
      <line
        x1="0"
        y1={SIG_THIRD}
        x2="100"
        y2={SIG_THIRD}
        stroke={SIG_GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={SIG_GRID_DASH}
      />
      <line
        x1="0"
        y1={SIG_THIRD * 2}
        x2="100"
        y2={SIG_THIRD * 2}
        stroke={SIG_GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={SIG_GRID_DASH}
      />
      <rect
        x="5"
        y="5"
        width="90"
        height="90"
        fill="none"
        stroke={SIG_RECT_STROKE}
        strokeWidth="0.65"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="4 3"
      />
      <line
        x1="50"
        y1="0"
        x2="50"
        y2="100"
        stroke={SIG_CENTER_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

export type SignatureCropEditorModalProps = {
  open: boolean;
  onClose: () => void;
  imageSrc?: string | null;
  applicationId?: string;
  document?: Document | null;
  onSave: (imageBase64: string) => void | Promise<void>;
  standaloneClientToolbar?: StandaloneCropClientToolbar;
};

export function SignatureCropEditorModal({
  open,
  onClose,
  imageSrc,
  applicationId,
  document: doc,
  onSave,
  standaloneClientToolbar,
}: SignatureCropEditorModalProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceObjectUrl, setSourceObjectUrl] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  const [rotationDeg, setRotationDeg] = useState(0);
  const rotationDegRef = useRef(0);

  const [zoomPct, setZoomPct] = useState(100);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);

  const [crop, setCrop] = useState<Crop>();

  const [portalExportChecks, setPortalExportChecks] = useState<{
    ratio: boolean;
    minDim: boolean;
    maxDim: boolean;
    underByteLimit: boolean;
    jpeg: boolean;
  } | null>(null);

  const [finalKb, setFinalKb] = useState<string>("—");
  const [compressError, setCompressError] = useState<string | null>(null);
  const [previewOriginalUrl, setPreviewOriginalUrl] = useState<string | null>(
    null
  );
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(
    null
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [mediaNatural, setMediaNatural] = useState<{ w: number; h: number } | null>(
    null
  );

  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneForUrl = useRef<string | null>(null);

  const panDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);

  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const displayImgRef = useRef<HTMLImageElement | null>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDisplayUrlForCropRef = useRef<string | null>(null);

  const revokeUrls = useRef<string[]>([]);

  const cleanupUrls = useCallback(() => {
    for (const u of revokeUrls.current) URL.revokeObjectURL(u);
    revokeUrls.current = [];
  }, []);

  const pushRevoke = (u: string) => {
    revokeUrls.current.push(u);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadError(null);
    setRotationDeg(0);
    rotationDegRef.current = 0;
    setZoomPct(100);
    setBrightness(0);
    setContrast(0);
    setShowGuides(true);
    setCrop(undefined);
    setPortalExportChecks(null);
    setFinalKb("—");
    setCompressError(null);
    cleanupUrls();

    setSourceObjectUrl(null);
    setDisplayUrl(null);
    setPreviewOriginalUrl(null);
    setPreviewResultUrl(null);

    setMediaNatural(null);
    lastDisplayUrlForCropRef.current = null;
    rotatedCanvasRef.current = null;
    sourceImgRef.current = null;

    const trimmedSrc = imageSrc?.trim();
    if (trimmedSrc) {
      setSourceObjectUrl(trimmedSrc);
      return () => {
        cancelled = true;
      };
    }

    if (!doc?.drive_file_id || !applicationId) return;

    const dl = `/api/documents/download?application_id=${encodeURIComponent(
      applicationId
    )}&drive_file_id=${encodeURIComponent(doc.drive_file_id)}&filename=${encodeURIComponent(
      doc.file_name || "signature.jpg"
    )}`;

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
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, imageSrc, doc, applicationId, cleanupUrls]);

  const rebuildRotatedDisplay = useCallback((img: HTMLImageElement, deg: number) => {
    const canvas = drawRotatedToCanvas(img, deg);
    rotatedCanvasRef.current = canvas;
    void canvasToObjectUrl(canvas).then((url) => {
      setDisplayUrl((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
      pushRevoke(url);
    });
  }, []);

  const onSourceImageLoad = useCallback(() => {
    const img = sourceImgRef.current;
    if (!img?.naturalWidth) return;
    rebuildRotatedDisplay(img, rotationDegRef.current);
  }, [rebuildRotatedDisplay]);

  useEffect(() => {
    const img = sourceImgRef.current;
    if (!img?.naturalWidth || !sourceObjectUrl) return;
    rebuildRotatedDisplay(img, rotationDeg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationDeg, sourceObjectUrl, rebuildRotatedDisplay]);

  const initialWideCrop = useCallback(
    (mediaWidth: number, mediaHeight: number): Crop =>
      centerCrop(
        makeAspectCrop({ unit: "%", width: 80 }, 3, mediaWidth, mediaHeight),
        mediaWidth,
        mediaHeight
      ),
    []
  );

  const onDisplayImageLoad = useCallback(() => {
    const el = displayImgRef.current;
    if (!el?.naturalWidth || !displayUrl) return;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setMediaNatural({ w, h });
    if (lastDisplayUrlForCropRef.current !== displayUrl) {
      lastDisplayUrlForCropRef.current = displayUrl;
      setCrop(initialWideCrop(w, h));
    }
  }, [displayUrl, initialWideCrop]);

  const buildFilteredExportCanvas = useCallback((): HTMLCanvasElement | null => {
    const src = rotatedCanvasRef.current;
    const img = displayImgRef.current;
    if (!src || !img?.naturalWidth || !crop?.width) return null;
    const pixel = convertToPixelCrop(crop, img.naturalWidth, img.naturalHeight);
    const cropped = exportCroppedToCanvas(src, pixel);
    return applyCanvasFilters(cropped, brightness, contrast);
  }, [crop, brightness, contrast]);

  const updatePreview = useCallback(async () => {
    const filtered = buildFilteredExportCanvas();
    const src = rotatedCanvasRef.current;
    if (!filtered || !src) {
      setPreviewResultUrl(null);
      setPreviewOriginalUrl(null);
      setFinalKb("—");
      setPortalExportChecks(null);
      setCompressError(null);
      return;
    }

    const origThumb = document.createElement("canvas");
    origThumb.width = 80;
    origThumb.height = 80;
    const octx = origThumb.getContext("2d");
    if (octx) octx.drawImage(src, 0, 0, src.width, src.height, 0, 0, 80, 80);

    const origBlob = await new Promise<Blob | null>((resolve) =>
      origThumb.toBlob((b) => resolve(b), "image/jpeg", 0.82)
    );
    if (origBlob) {
      const ou = URL.createObjectURL(origBlob);
      setPreviewOriginalUrl((old) => {
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        return ou;
      });
    }

    const PREVIEW_W = 200;
    const PREVIEW_H = Math.round(PREVIEW_W / 3);
    const prev = document.createElement("canvas");
    prev.width = PREVIEW_W;
    prev.height = PREVIEW_H;
    const pctx = prev.getContext("2d");
    if (pctx) {
      pctx.drawImage(filtered, 0, 0, EXPORT_W, EXPORT_H, 0, 0, PREVIEW_W, PREVIEW_H);
    }

    const prevBlob = await new Promise<Blob | null>((resolve) =>
      prev.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    if (prevBlob) {
      const pu = URL.createObjectURL(prevBlob);
      setPreviewResultUrl((old) => {
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        return pu;
      });
    }

    try {
      const outBlob = await compressCanvasToLimit(
        filtered,
        PORTAL_IMAGE_MAX_BYTES
      );
      setFinalKb((outBlob.size / 1024).toFixed(1));
      setPortalExportChecks(
        await evaluateOciApplicantSignatureExportBlob(outBlob, EXPORT_W, EXPORT_H)
      );
      setCompressError(null);
    } catch (e) {
      setFinalKb("—");
      setPortalExportChecks(null);
      setCompressError(e instanceof Error ? e.message : String(e));
    }
  }, [buildFilteredExportCanvas]);

  useEffect(() => {
    if (!open || !displayUrl) return;
    const t = window.setTimeout(() => {
      void updatePreview();
    }, 120);
    return () => clearTimeout(t);
  }, [open, displayUrl, crop, updatePreview, brightness, contrast]);

  const nudgeCrop = useCallback(
    (dx: number, dy: number) => {
      const img = displayImgRef.current;
      if (!img?.naturalWidth || !crop?.width) return;
      const cw = img.clientWidth;
      const ch = img.clientHeight;
      if (cw < 1 || ch < 1) return;
      const px = convertToPixelCrop(crop, cw, ch);
      let x = px.x + dx;
      let y = px.y + dy;
      x = Math.max(0, Math.min(x, cw - px.width));
      y = Math.max(0, Math.min(y, ch - px.height));
      setCrop(convertToPercentCrop({ ...px, x, y }, cw, ch));
    },
    [crop]
  );

  useLayoutEffect(() => {
    if (!displayUrl) {
      initialScrollDoneForUrl.current = null;
      return;
    }
    if (initialScrollDoneForUrl.current === displayUrl) return;
    const el = canvasScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
      initialScrollDoneForUrl.current = displayUrl;
    });
    return () => cancelAnimationFrame(id);
  }, [displayUrl]);

  const meetsOciPortalExport = allOciApplicantSignatureChecksPass(
    portalExportChecks
  );
  const c = portalExportChecks;

  const buildFinalBlob = useCallback(async (): Promise<Blob> => {
    const filtered = buildFilteredExportCanvas();
    if (!filtered) throw new Error("Image or crop not ready.");
    return compressCanvasToLimit(filtered, PORTAL_IMAGE_MAX_BYTES);
  }, [buildFilteredExportCanvas]);

  const onApplyDownload = useCallback(async () => {
    try {
      const blob = await buildFinalBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = standaloneClientToolbar
        ? standalonePhotoDriveName(
            "signature",
            standaloneClientToolbar.clientLabel
          )
        : "signature-cropped.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [buildFinalBlob, standaloneClientToolbar]);

  const onApplyPreview = useCallback(async () => {
    if (!standaloneClientToolbar) return;
    setPreviewBusy(true);
    setLoadError(null);
    try {
      const blob = await buildFinalBlob();
      const buf = await blob.arrayBuffer();
      const b64 = uint8ToBase64(new Uint8Array(buf));
      await standaloneClientToolbar.onPreview(b64);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewBusy(false);
    }
  }, [buildFinalBlob, standaloneClientToolbar]);

  const onApplySave = useCallback(async () => {
    setSaveBusy(true);
    setLoadError(null);
    try {
      const blob = await buildFinalBlob();
      const buf = await blob.arrayBuffer();
      const b64 = uint8ToBase64(new Uint8Array(buf));
      await onSave(b64);
      onClose();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }, [buildFinalBlob, onSave, onClose]);

  const handleClose = useCallback(() => {
    cleanupUrls();
    setDisplayUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewResultUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });
    setPreviewOriginalUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });
    setSourceObjectUrl(null);
    setLoadError(null);
    setPortalExportChecks(null);
    setCompressError(null);
    onClose();
  }, [cleanupUrls, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t?.closest("input, textarea, select, [contenteditable=true]")
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (!saveBusy && !previewBusy) handleClose();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotationDegRef.current = 0;
        setRotationDeg(0);
        return;
      }
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setShowGuides((g) => !g);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (meetsOciPortalExport && displayUrl && crop?.width) {
          if (standaloneClientToolbar) {
            void onApplyPreview();
          } else {
            void onApplyDownload();
          }
        }
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCrop((prev) => {
          if (!prev) return prev;
          const img = displayImgRef.current;
          if (!img?.naturalWidth) return prev;
          const cw = img.clientWidth;
          const ch = img.clientHeight;
          const px = convertToPixelCrop(prev, cw, ch);
          const x = px.x;
          const y = Math.max(0, Math.min(px.y - step, ch - px.height));
          return convertToPercentCrop({ ...px, x, y }, cw, ch);
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCrop((prev) => {
          if (!prev) return prev;
          const img = displayImgRef.current;
          if (!img?.naturalWidth) return prev;
          const cw = img.clientWidth;
          const ch = img.clientHeight;
          const px = convertToPixelCrop(prev, cw, ch);
          const x = px.x;
          const y = Math.max(0, Math.min(px.y + step, ch - px.height));
          return convertToPercentCrop({ ...px, x, y }, cw, ch);
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCrop((prev) => {
          if (!prev) return prev;
          const img = displayImgRef.current;
          if (!img?.naturalWidth) return prev;
          const cw = img.clientWidth;
          const ch = img.clientHeight;
          const px = convertToPixelCrop(prev, cw, ch);
          const y = px.y;
          const x = Math.max(0, Math.min(px.x - step, cw - px.width));
          return convertToPercentCrop({ ...px, x, y }, cw, ch);
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCrop((prev) => {
          if (!prev) return prev;
          const img = displayImgRef.current;
          if (!img?.naturalWidth) return prev;
          const cw = img.clientWidth;
          const ch = img.clientHeight;
          const px = convertToPixelCrop(prev, cw, ch);
          const y = px.y;
          const x = Math.max(0, Math.min(px.x + step, cw - px.width));
          return convertToPercentCrop({ ...px, x, y }, cw, ch);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    saveBusy,
    previewBusy,
    handleClose,
    meetsOciPortalExport,
    displayUrl,
    crop?.width,
    onApplyDownload,
    standaloneClientToolbar,
    onApplyPreview,
  ]);

  const shortcutsTitle = standaloneClientToolbar
    ? "Shortcuts: Arrow keys nudge crop (Shift+Arrow 10px). R reset rotation. G toggle guides. Enter Save preview. Esc Cancel."
    : "Shortcuts: Arrow keys nudge crop (Shift+Arrow 10px). R reset rotation. G toggle guides. Enter Apply & Download. Esc Cancel.";

  const imgFilter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%)`;
  const zoomScale = zoomPct / 100;
  const displayW = mediaNatural ? Math.round(mediaNatural.w * zoomScale) : undefined;

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit applicant signature"
    >
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Edit applicant signature
            </h2>
            <span className="relative group inline-flex">
              <button
                type="button"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Keyboard shortcuts"
                title={shortcutsTitle}
              >
                ⌨️
              </button>
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-72 rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700 shadow-lg group-hover:block group-focus-within:block">
                {shortcutsTitle}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>

        <div
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto p-5",
            styles.signatureEditorShell
          )}
        >
          {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

          {sourceObjectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={sourceImgRef}
              src={sourceObjectUrl}
              alt=""
              className="hidden"
              onLoad={onSourceImageLoad}
            />
          ) : !loadError &&
            open &&
            (doc?.drive_file_id || imageSrc?.trim()) ? (
            <p className="text-sm text-slate-600">Loading image…</p>
          ) : null}

          {displayUrl ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
              <div className="flex min-h-0 min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!displayUrl}
                    onClick={() => setShowGuides((g) => !g)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-50"
                  >
                    {showGuides ? "Hide guides" : "Show guides"}
                  </button>
                  {zoomPct > 100 ? (
                    <span className="text-[11px] text-slate-500">
                      Drag the image area to pan when zoomed.
                    </span>
                  ) : null}
                </div>
                <div
                  ref={canvasScrollRef}
                  className={clsx(
                    styles.canvasFrame,
                    "max-h-[min(58vh,560px)] min-h-[220px] overflow-auto rounded-lg"
                  )}
                  onPointerDown={(e) => {
                    if (zoomPct <= 100) return;
                    const t = e.target as Element | null;
                    if (
                      t?.closest(".ReactCrop__crop-selection") ||
                      t?.closest(".ReactCrop__handle")
                    ) {
                      return;
                    }

                    const el = e.currentTarget;
                    panDragRef.current = {
                      pointerId: e.pointerId,
                      startX: e.clientX,
                      startY: e.clientY,
                      startScrollLeft: el.scrollLeft,
                      startScrollTop: el.scrollTop,
                    };
                    try {
                      el.setPointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                    e.preventDefault();
                  }}
                  onPointerMove={(e) => {
                    const st = panDragRef.current;
                    if (!st || st.pointerId !== e.pointerId) return;
                    const el = e.currentTarget;
                    const dx = e.clientX - st.startX;
                    const dy = e.clientY - st.startY;
                    el.scrollLeft = st.startScrollLeft - dx;
                    el.scrollTop = st.startScrollTop - dy;
                    e.preventDefault();
                  }}
                  onPointerUp={(e) => {
                    const st = panDragRef.current;
                    if (!st || st.pointerId !== e.pointerId) return;
                    panDragRef.current = null;
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onPointerCancel={() => {
                    panDragRef.current = null;
                  }}
                >
                  <div
                    className={clsx("inline-block p-1", styles.signatureCropWrap)}
                  >
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      aspect={3}
                      className="inline-block max-w-none"
                      renderSelectionAddon={
                        showGuides
                          ? () => <SignatureAreaOverlay />
                          : undefined
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={displayImgRef}
                        src={displayUrl}
                        alt="Crop preview"
                        style={{
                          width: displayW ? `${displayW}px` : undefined,
                          height: "auto",
                          maxWidth: "none",
                          filter: imgFilter,
                          display: "block",
                        }}
                        onLoad={onDisplayImageLoad}
                      />
                    </ReactCrop>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-[#64748b]">
                      Original
                    </p>
                    <div className="h-16 w-16 overflow-hidden rounded bg-slate-100">
                      {previewOriginalUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewOriginalUrl}
                          alt=""
                          width={64}
                          height={64}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                          …
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[10px] font-medium text-[#64748b]">
                      Result
                    </p>
                    <div className="h-[67px] w-[200px] overflow-hidden rounded-lg bg-slate-100">
                      {previewResultUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewResultUrl}
                          alt="Export preview"
                          width={200}
                          height={67}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          …
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#64748b]">
                      {EXPORT_W} × {EXPORT_H} px · ~{finalKb} KB
                      {compressError ? (
                        <span className="ml-1 text-red-600">
                          ({compressError})
                        </span>
                      ) : null}
                    </p>
                    <p
                      className={clsx(
                        "mt-1 text-xs font-medium",
                        meetsOciPortalExport ? "text-green-700" : "text-red-700"
                      )}
                    >
                      {meetsOciPortalExport
                        ? "✅ Meets OCI requirements"
                        : "❌ Adjust crop or brightness"}
                    </p>
                    <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-[#444]">
                      <li>{c?.ratio ? "✅" : "❌"} 3:1 ratio</li>
                      <li>
                        {c?.minDim ? "✅" : "❌"} Min{" "}
                        {OCI_APPLICANT_SIGNATURE_MIN_WIDTH_PX}×
                        {OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX}
                      </li>
                      <li>
                        {c?.maxDim ? "✅" : "❌"} Max{" "}
                        {OCI_APPLICANT_SIGNATURE_MAX_WIDTH_PX}×
                        {OCI_APPLICANT_SIGNATURE_MAX_HEIGHT_PX}
                      </li>
                      <li>
                        {c?.underByteLimit ? "✅" : "❌"} Under {PORTAL_MAX_KB}
                        KB
                        {compressError ? (
                          <span className="ml-1 text-red-600">
                            ({compressError})
                          </span>
                        ) : null}
                      </li>
                      <li>{c?.jpeg ? "✅" : "❌"} JPEG</li>
                    </ul>
                  </div>
                </div>

                <hr className="border-0 border-t border-slate-200" />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[13px] text-[#444]">
                      Rotation
                    </span>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      value={rotationDeg}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        rotationDegRef.current = v;
                        setRotationDeg(v);
                      }}
                      className="min-w-0 flex-1"
                      aria-label="Rotation"
                    />
                    <span className="flex w-[100px] shrink-0 items-center justify-end gap-2 text-[13px] text-[#444] tabular-nums">
                      {rotationDeg > 0 ? "+" : ""}
                      {rotationDeg}°
                      <button
                        type="button"
                        className="text-xs font-medium text-[#2563eb] hover:underline"
                        onClick={() => {
                          rotationDegRef.current = 0;
                          setRotationDeg(0);
                        }}
                      >
                        Reset
                      </button>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[13px] text-[#444]">
                      Zoom
                    </span>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      value={zoomPct}
                      onChange={(e) => setZoomPct(Number(e.target.value))}
                      className="min-w-0 flex-1"
                      aria-label="Zoom"
                    />
                    <span className="flex w-[100px] shrink-0 items-center justify-end gap-2 text-[13px] text-[#444] tabular-nums">
                      {zoomPct}%
                      <button
                        type="button"
                        className="text-xs font-medium text-[#2563eb] hover:underline"
                        onClick={() => setZoomPct(100)}
                      >
                        Reset
                      </button>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[13px] text-[#444]">
                      Brightness
                    </span>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="min-w-0 flex-1"
                      aria-label="Brightness"
                    />
                    <span className="flex w-[100px] shrink-0 items-center justify-end gap-2 text-[13px] text-[#444] tabular-nums">
                      {brightness > 0 ? "+" : ""}
                      {brightness}
                      <button
                        type="button"
                        className="text-xs font-medium text-[#2563eb] hover:underline"
                        onClick={() => setBrightness(0)}
                      >
                        Reset
                      </button>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[13px] text-[#444]">
                      Contrast
                    </span>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="min-w-0 flex-1"
                      aria-label="Contrast"
                    />
                    <span className="flex w-[100px] shrink-0 items-center justify-end gap-2 text-[13px] text-[#444] tabular-nums">
                      {contrast > 0 ? "+" : ""}
                      {contrast}
                      <button
                        type="button"
                        className="text-xs font-medium text-[#2563eb] hover:underline"
                        onClick={() => setContrast(0)}
                      >
                        Reset
                      </button>
                    </span>
                  </div>
                </div>

                <div
                  className="mx-auto flex w-max flex-col items-center gap-0.5"
                  role="group"
                  aria-label="Nudge crop"
                >
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-sm hover:bg-slate-50"
                    onClick={() => nudgeCrop(0, -5)}
                    aria-label="Nudge up"
                  >
                    ↑
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-sm hover:bg-slate-50"
                      onClick={() => nudgeCrop(-5, 0)}
                      aria-label="Nudge left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-sm hover:bg-slate-50"
                      onClick={() => nudgeCrop(5, 0)}
                      aria-label="Nudge right"
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-sm hover:bg-slate-50"
                    onClick={() => nudgeCrop(0, 5)}
                    aria-label="Nudge down"
                  >
                    ↓
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200">
          {standaloneClientToolbar ? (
            <>
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 max-w-md flex-1 flex-col gap-1">
                  <label
                    htmlFor="standalone-sig-client"
                    className="text-xs font-medium text-slate-700"
                  >
                    Client (optional — used in download and Drive filenames)
                  </label>
                  <input
                    id="standalone-sig-client"
                    type="text"
                    value={standaloneClientToolbar.clientLabel}
                    onChange={(e) =>
                      standaloneClientToolbar.onClientLabelChange(
                        e.target.value
                      )
                    }
                    placeholder="e.g. Priya Sharma"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                    autoComplete="off"
                  />
                </div>
                <p className="text-[11px] leading-snug text-slate-500 sm:max-w-xs sm:text-right">
                  Save preview keeps the cropped JPEG in this browser session so
                  you can review it, then download or upload to Drive.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 px-4 pb-3">
                <button
                  type="button"
                  disabled={
                    !displayUrl ||
                    !crop?.width ||
                    !meetsOciPortalExport ||
                    saveBusy ||
                    previewBusy
                  }
                  onClick={() => void onApplyPreview()}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {previewBusy ? "Saving preview…" : "Save preview"}
                </button>
                <button
                  type="button"
                  disabled={
                    !displayUrl || !crop?.width || !meetsOciPortalExport || saveBusy
                  }
                  onClick={() => void onApplyDownload()}
                  className="rounded-lg border border-[#1e3a5f] bg-white px-4 py-2 text-sm font-semibold text-[#1e3a5f] hover:bg-slate-50 disabled:opacity-50"
                >
                  Download
                </button>
                <button
                  type="button"
                  disabled={
                    !displayUrl || !crop?.width || !meetsOciPortalExport || saveBusy
                  }
                  onClick={() => void onApplySave()}
                  className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d4d73] disabled:opacity-50"
                >
                  {saveBusy ? "Saving…" : "Save to Drive"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-2 px-4 py-3">
              <button
                type="button"
                disabled={
                  !displayUrl || !crop?.width || !meetsOciPortalExport || saveBusy
                }
                onClick={() => {
                  void onApplyDownload();
                }}
                className="rounded-lg border border-[#1e3a5f] bg-white px-4 py-2 text-sm font-semibold text-[#1e3a5f] hover:bg-slate-50 disabled:opacity-50"
              >
                Apply &amp; Download
              </button>

              <button
                type="button"
                disabled={
                  !displayUrl || !crop?.width || !meetsOciPortalExport || saveBusy
                }
                onClick={() => {
                  void onApplySave();
                }}
                className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d4d73] disabled:opacity-50"
              >
                {saveBusy ? "Saving…" : "Apply & Save to Drive"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

