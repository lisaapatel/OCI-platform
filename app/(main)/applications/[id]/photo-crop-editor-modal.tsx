"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

import {
  allOciApplicantPhotoChecksPass,
  evaluateOciApplicantPhotoExportBlob,
  OCI_APPLICANT_PHOTO_MAX_PX,
  OCI_APPLICANT_PHOTO_MIN_PX,
  OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX,
  type OciApplicantPhotoExportChecks,
} from "@/lib/oci-applicant-photo-rules";
import {
  allPassportRenewalPhotoAutoChecksPass,
  evaluatePassportRenewalPhotoExportBlob,
  PASSPORT_RENEWAL_EXPORT_PX,
  PASSPORT_RENEWAL_PHOTO_SPECS,
  type PassportRenewalPhotoExportChecks,
} from "@/lib/passport-photo-specs";
import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";
import type { Document } from "@/lib/types";

import styles from "./photo-crop-editor-modal.module.css";

const OCI_EXPORT_PX = 600;
const PORTAL_MAX_KB = Math.round(PORTAL_IMAGE_MAX_BYTES / 1024);

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
  if (last && last.size <= maxBytes) return last;
  throw new Error(
    `Could not compress under portal limit (${Math.round(maxBytes / 1024)}KB).`
  );
}

async function compressCanvasToByteRange(
  canvas: HTMLCanvasElement,
  minBytes: number,
  maxBytes: number
): Promise<Blob> {
  let q = 0.88;
  let lastBlob: Blob | null = null;
  for (let i = 0; i < 28; i++) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", q)
    );
    if (!blob) throw new Error("toBlob failed");
    lastBlob = blob;
    if (blob.size <= maxBytes && blob.size >= minBytes) return blob;
    if (blob.size > maxBytes) q -= 0.04;
    else q += 0.03;
    q = Math.max(0.28, Math.min(0.95, q));
  }
  if (lastBlob && lastBlob.size <= maxBytes) return lastBlob;
  throw new Error(
    `Could not produce JPEG between ${Math.round(minBytes / 1024)}KB and ${Math.round(maxBytes / 1024)}KB.`
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
  pixelCrop: PixelCrop,
  edgePx: number
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = edgePx;
  out.height = edgePx;
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
    edgePx,
    edgePx
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

/** Passport-style guides in selection-local coords (viewBox 0–100, y grows downward).
 * Eye line: ~upper third — aligns with common 2×2 guidance (eyes ~1⅛–1⅜″ from *bottom*
 * of a 2″ photo ≈ ~32–44% from top; we use ~40% so the line sits near eye level).
 * Chin line: below mid-face, above collar (~76% from top; 85% sat too low on many crops).
 */
const GUIDE_EYES_Y = 40;
const GUIDE_CHIN_Y = 76;
const GRID_STROKE = "rgba(14, 36, 68, 0.85)";
const GRID_DASH = "2.5 2.5";
const FACE_H_STROKE = "#172554";
const CENTER_V_STROKE = "rgba(30, 41, 55, 0.9)";
const FACE_ELLIPSE_STROKE = "rgba(18, 42, 110, 0.75)";
const THIRD = 100 / 3;

function PassportGuidesOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        x1={THIRD}
        y1="0"
        x2={THIRD}
        y2="100"
        stroke={GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={GRID_DASH}
      />
      <line
        x1={THIRD * 2}
        y1="0"
        x2={THIRD * 2}
        y2="100"
        stroke={GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={GRID_DASH}
      />
      <line
        x1="0"
        y1={THIRD}
        x2="100"
        y2={THIRD}
        stroke={GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={GRID_DASH}
      />
      <line
        x1="0"
        y1={THIRD * 2}
        x2="100"
        y2={THIRD * 2}
        stroke={GRID_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={GRID_DASH}
      />
      <line
        x1="0"
        y1={GUIDE_EYES_Y}
        x2="100"
        y2={GUIDE_EYES_Y}
        stroke={FACE_H_STROKE}
        strokeWidth="0.38"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="4 3"
      />
      <line
        x1="0"
        y1={GUIDE_CHIN_Y}
        x2="100"
        y2={GUIDE_CHIN_Y}
        stroke={FACE_H_STROKE}
        strokeWidth="0.38"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="4 3"
      />
      <line
        x1="50"
        y1="0"
        x2="50"
        y2="100"
        stroke={CENTER_V_STROKE}
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="2 2"
      />
      <ellipse
        cx="50"
        cy={52}
        rx="26"
        ry="32"
        fill="none"
        stroke={FACE_ELLIPSE_STROKE}
        strokeWidth="0.52"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export type PhotoCropEditorModalProps = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  document: Document | null;
  onSaved: () => void | Promise<void>;
  /** When set (e.g. passport renewal), uses VFS-oriented limits instead of OCI portal limits. */
  photoSpecs?: typeof PASSPORT_RENEWAL_PHOTO_SPECS;
};

export function PhotoCropEditorModal({
  open,
  onClose,
  applicationId,
  document: doc,
  onSaved,
  photoSpecs,
}: PhotoCropEditorModalProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceObjectUrl, setSourceObjectUrl] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [showGuides, setShowGuides] = useState(true);
  const [crop, setCrop] = useState<Crop>();
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(null);
  const [previewOriginalUrl, setPreviewOriginalUrl] = useState<string | null>(
    null
  );
  const [finalKb, setFinalKb] = useState<string>("—");
  const [portalExportChecks, setPortalExportChecks] =
    useState<OciApplicantPhotoExportChecks | null>(null);
  const [passportExportChecks, setPassportExportChecks] =
    useState<PassportRenewalPhotoExportChecks | null>(null);
  const [whiteBackgroundConfirmed, setWhiteBackgroundConfirmed] =
    useState(false);
  const [compressError, setCompressError] = useState<string | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceHint, setFaceHint] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mediaNatural, setMediaNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const exportEdgePx = photoSpecs ? PASSPORT_RENEWAL_EXPORT_PX : OCI_EXPORT_PX;

  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const displayImgRef = useRef<HTMLImageElement | null>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const revokeUrls = useRef<string[]>([]);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneForUrl = useRef<string | null>(null);
  const rotationDegRef = useRef(0);
  const lastDisplayUrlForCropRef = useRef<string | null>(null);

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
    setZoomPct(100);
    setBrightness(0);
    setContrast(0);
    setShowGuides(true);
    setCrop(undefined);
    setMediaNatural(null);
    lastDisplayUrlForCropRef.current = null;
    setPreviewResultUrl(null);
    setPreviewOriginalUrl(null);
    setFinalKb("—");
    setPortalExportChecks(null);
    setPassportExportChecks(null);
    setWhiteBackgroundConfirmed(false);
    setCompressError(null);
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

  rotationDegRef.current = rotationDeg;

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

  const onDisplayImageLoad = useCallback(() => {
    const el = displayImgRef.current;
    if (!el?.naturalWidth || !displayUrl) return;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setMediaNatural({ w, h });
    if (lastDisplayUrlForCropRef.current !== displayUrl) {
      lastDisplayUrlForCropRef.current = displayUrl;
      setCrop(initialSquareCrop(w, h));
    }
  }, [displayUrl]);

  const buildFilteredExportCanvas = useCallback((): HTMLCanvasElement | null => {
    const src = rotatedCanvasRef.current;
    const img = displayImgRef.current;
    if (!src || !img?.naturalWidth || !crop?.width) return null;
    const pixel = convertToPixelCrop(crop, img.naturalWidth, img.naturalHeight);
    const cropped = exportCroppedToCanvas(src, pixel, exportEdgePx);
    return applyCanvasFilters(cropped, brightness, contrast);
  }, [crop, brightness, contrast, exportEdgePx]);

  const updatePreview = useCallback(async () => {
    const filtered = buildFilteredExportCanvas();
    const src = rotatedCanvasRef.current;
    if (!filtered || !src) {
      setPreviewResultUrl(null);
      setPreviewOriginalUrl(null);
      setFinalKb("—");
      setPortalExportChecks(null);
      setPassportExportChecks(null);
      setCompressError(null);
      return;
    }

    const origThumb = document.createElement("canvas");
    origThumb.width = 80;
    origThumb.height = 80;
    const octx = origThumb.getContext("2d");
    if (octx) {
      octx.drawImage(src, 0, 0, src.width, src.height, 0, 0, 80, 80);
    }
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

    const prev = document.createElement("canvas");
    prev.width = 200;
    prev.height = 200;
    const pctx = prev.getContext("2d");
    if (pctx) {
      pctx.drawImage(
        filtered,
        0,
        0,
        exportEdgePx,
        exportEdgePx,
        0,
        0,
        200,
        200
      );
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
      if (photoSpecs) {
        const minB = photoSpecs.minSizeKB * 1024;
        const maxB = photoSpecs.maxSizeKB * 1024;
        const outBlob = await compressCanvasToByteRange(
          filtered,
          minB,
          maxB
        );
        setFinalKb((outBlob.size / 1024).toFixed(1));
        setPassportExportChecks(
          await evaluatePassportRenewalPhotoExportBlob(
            outBlob,
            filtered.width,
            filtered.height
          )
        );
        setPortalExportChecks(null);
      } else {
        const outBlob = await compressCanvasToLimit(
          filtered,
          PORTAL_IMAGE_MAX_BYTES
        );
        setFinalKb((outBlob.size / 1024).toFixed(1));
        setPortalExportChecks(
          await evaluateOciApplicantPhotoExportBlob(
            outBlob,
            filtered.width,
            filtered.height
          )
        );
        setPassportExportChecks(null);
      }
      setCompressError(null);
    } catch (e) {
      setFinalKb("—");
      setPortalExportChecks(null);
      setPassportExportChecks(null);
      setCompressError(e instanceof Error ? e.message : String(e));
    }
  }, [buildFilteredExportCanvas, photoSpecs]);

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

  const applyPreset = useCallback(
    (fraction: number) => {
      const img = displayImgRef.current;
      if (!img?.naturalWidth || !crop?.width) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const cur = convertToPixelCrop(crop, nw, nh);
      const cx = cur.x + cur.width / 2;
      const cy = cur.y + cur.height / 2;
      let side = Math.min(nw, nh) * fraction;
      side = Math.min(side, Math.min(nw, nh));
      let left = cx - side / 2;
      let top = cy - side / 2;
      left = Math.max(0, Math.min(left, nw - side));
      top = Math.max(0, Math.min(top, nh - side));
      setCrop(
        convertToPercentCrop(
          { unit: "px", x: left, y: top, width: side, height: side },
          nw,
          nh
        )
      );
    },
    [crop]
  );

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
    const filtered = buildFilteredExportCanvas();
    if (!filtered) throw new Error("Image or crop not ready.");
    if (photoSpecs) {
      return compressCanvasToByteRange(
        filtered,
        photoSpecs.minSizeKB * 1024,
        photoSpecs.maxSizeKB * 1024
      );
    }
    return compressCanvasToLimit(filtered, PORTAL_IMAGE_MAX_BYTES);
  }, [buildFilteredExportCanvas, photoSpecs]);

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
    setFaceHint(null);
    onClose();
  }, [cleanupUrls, onClose]);

  const meetsOciPortalExport =
    !compressError && allOciApplicantPhotoChecksPass(portalExportChecks);
  const meetsPassportPortalExport =
    !compressError &&
    allPassportRenewalPhotoAutoChecksPass(passportExportChecks) &&
    whiteBackgroundConfirmed;
  const meetsPortalExport = photoSpecs
    ? meetsPassportPortalExport
    : meetsOciPortalExport;
  const c = portalExportChecks;
  const pc = passportExportChecks;

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
        if (!saveBusy) handleClose();
        return;
      }
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setShowGuides((g) => !g);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setRotationDeg(0);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (meetsPortalExport && displayUrl && crop?.width) {
          void onApplyDownload();
        }
        return;
      }
      const step = e.shiftKey ? 20 : 5;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeCrop(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeCrop(0, step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeCrop(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeCrop(step, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    saveBusy,
    handleClose,
    meetsPortalExport,
    displayUrl,
    crop?.width,
    nudgeCrop,
    onApplyDownload,
  ]);

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

  const imgFilter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%)`;
  const zoomScale = zoomPct / 100;
  const displayW = mediaNatural
    ? Math.round(mediaNatural.w * zoomScale)
    : undefined;

  if (!mounted || !open) return null;

  const shortcutsTitle =
    "Shortcuts: Arrow keys nudge crop (Shift+Arrow 20px). R reset rotation. G toggle guides. Enter Apply & Download. Esc Cancel.";

  const portal = (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit applicant photo"
    >
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Edit applicant photo
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
            styles.photoEditorShell
          )}
        >
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

          {displayUrl ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
              <div className="flex min-h-0 min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!displayUrl || faceBusy}
                    onClick={() => void runFaceCenter()}
                    className="rounded-md border border-[#1e3a5f] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[#1e3a5f] disabled:opacity-50"
                  >
                    {faceBusy ? "Detecting face…" : "Auto-center face"}
                  </button>
                  <button
                    type="button"
                    disabled={!displayUrl}
                    onClick={() => setShowGuides((g) => !g)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-50"
                  >
                    {showGuides ? "Hide guides" : "Show guides"}
                  </button>
                  {faceHint ? (
                    <span className="text-xs text-amber-800">{faceHint}</span>
                  ) : null}
                </div>
                <div
                  ref={canvasScrollRef}
                  className={clsx(
                    styles.canvasFrame,
                    "max-h-[min(58vh,560px)] min-h-[220px] overflow-auto rounded-lg"
                  )}
                >
                  <div className={clsx("inline-block p-1", styles.photoCropWrap)}>
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      aspect={1}
                      className="inline-block max-w-none"
                      renderSelectionAddon={
                        showGuides ? () => <PassportGuidesOverlay /> : undefined
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
                        /* eslint-disable-next-line @next/next/no-img-element */
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
                    <div className="h-[200px] w-[200px] overflow-hidden rounded-lg bg-slate-100">
                      {previewResultUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={previewResultUrl}
                          alt="Export preview"
                          width={200}
                          height={200}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          …
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#64748b]">
                      {exportEdgePx} × {exportEdgePx} px · ~{finalKb} KB
                      {compressError ? (
                        <span className="ml-1 text-red-600">({compressError})</span>
                      ) : null}
                    </p>
                    <p
                      className={clsx(
                        "mt-1 text-xs font-medium",
                        meetsPortalExport ? "text-green-700" : "text-red-700"
                      )}
                    >
                      {meetsPortalExport
                        ? photoSpecs
                          ? "✅ Meets passport renewal photo checks"
                          : "✅ Meets OCI requirements"
                        : "❌ Adjust crop or brightness"}
                    </p>
                    {photoSpecs ? (
                      <>
                        <p className="mt-2 text-[11px] leading-snug text-slate-600">
                          {photoSpecs.faceCoverageNote}
                        </p>
                        <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-[#444]">
                          <li>
                            {pc?.square ? "✅" : "❌"} Square 1:1 (±
                            {photoSpecs.squareTolerancePx}px)
                          </li>
                          <li>
                            {pc?.minDim ? "✅" : "❌"} Min{" "}
                            {photoSpecs.minWidth}×{photoSpecs.minHeight}px
                          </li>
                          <li>
                            {pc?.maxDim ? "✅" : "❌"} Max{" "}
                            {photoSpecs.maxWidth}×{photoSpecs.maxHeight}px
                          </li>
                          <li>
                            {pc?.byteRangeOk ? "✅" : "❌"} File size{" "}
                            {photoSpecs.minSizeKB}–{photoSpecs.maxSizeKB}KB
                            {compressError ? (
                              <span className="ml-1 text-red-600">
                                ({compressError})
                              </span>
                            ) : null}
                          </li>
                          <li>{pc?.jpeg ? "✅" : "❌"} JPEG</li>
                          <li className="flex items-start gap-2 pt-1">
                            <input
                              id="passport-white-bg"
                              type="checkbox"
                              checked={whiteBackgroundConfirmed}
                              onChange={(e) =>
                                setWhiteBackgroundConfirmed(e.target.checked)
                              }
                              className="mt-0.5"
                            />
                            <label
                              htmlFor="passport-white-bg"
                              className="cursor-pointer font-medium"
                            >
                              {whiteBackgroundConfirmed ? "✅" : "⬜"}{" "}
                              {photoSpecs.backgroundNote} (confirm manually)
                            </label>
                          </li>
                        </ul>
                      </>
                    ) : (
                      <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-[#444]">
                        <li>
                          {c?.square ? "✅" : "❌"} Square 1:1 (±
                          {OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX}px)
                        </li>
                        <li>
                          {c?.minDim ? "✅" : "❌"} Min{" "}
                          {OCI_APPLICANT_PHOTO_MIN_PX}×{OCI_APPLICANT_PHOTO_MIN_PX}px
                        </li>
                        <li>
                          {c?.maxDim ? "✅" : "❌"} Max{" "}
                          {OCI_APPLICANT_PHOTO_MAX_PX}×{OCI_APPLICANT_PHOTO_MAX_PX}px
                        </li>
                        <li>
                          {c?.underByteLimit ? "✅" : "❌"} Under {PORTAL_MAX_KB}KB
                          {compressError ? (
                            <span className="ml-1 text-red-600">
                              ({compressError})
                            </span>
                          ) : null}
                        </li>
                        <li>{c?.jpeg ? "✅" : "❌"} JPEG</li>
                      </ul>
                    )}
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
                      min={-45}
                      max={45}
                      value={rotationDeg}
                      onChange={(e) => setRotationDeg(Number(e.target.value))}
                      className="min-w-0 flex-1"
                      aria-label="Rotation"
                    />
                    <span className="flex w-[100px] shrink-0 items-center justify-end gap-2 text-[13px] text-[#444] tabular-nums">
                      {rotationDeg > 0 ? "+" : ""}
                      {rotationDeg}°
                      <button
                        type="button"
                        className="text-xs font-medium text-[#2563eb] hover:underline"
                        onClick={() => setRotationDeg(0)}
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

                <div className="flex flex-wrap justify-center gap-1">
                  <button
                    type="button"
                    disabled={!displayUrl}
                    onClick={() => applyPreset(0.7)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Tight
                  </button>
                  <button
                    type="button"
                    disabled={!displayUrl}
                    onClick={() => applyPreset(0.85)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    disabled={!displayUrl}
                    onClick={() => applyPreset(0.95)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Loose
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={
              !displayUrl || !crop?.width || !meetsPortalExport || saveBusy
            }
            onClick={() => void onApplyDownload()}
            className="rounded-lg border border-[#1e3a5f] bg-white px-4 py-2 text-sm font-semibold text-[#1e3a5f] hover:bg-slate-50 disabled:opacity-50"
          >
            Apply &amp; Download
          </button>
          <button
            type="button"
            disabled={
              !displayUrl || !crop?.width || !meetsPortalExport || saveBusy
            }
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
