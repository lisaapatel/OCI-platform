"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";

import {
  dedupeExtractedFieldsLatest,
  type ExtractedFieldRow,
} from "@/lib/extracted-fields-dedupe";
import {
  isAutoReconConflictNote,
  parseConflictSourcesFromFlagNote,
  parseLegacyAutoReconNote,
} from "@/lib/review-legacy-auto-recon";
import {
  ADDRESS_PROOF_FIELD_NAME_SET,
  ADDRESS_PROOF_SOURCE_DOC_TYPES,
} from "@/lib/address-proof-fields";
import {
  REVIEW_SECTION_ORDER,
  documentTabLabel,
  drivePreviewUrl,
  fieldSectionId,
  humanFieldLabel,
  isImageFileName,
  parseDriveFileId,
  sourceDocumentLabel,
} from "@/lib/review-field-display";
import { applicantIsMinorFromFields } from "@/lib/applicant-minor";
import type { ExtractedField } from "@/lib/types";

import { ReviewDocumentRail } from "./review-document-rail";
import type { DocumentRailStats } from "./review-document-rail";
import {
  ReviewPreviewToolbar,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "./review-preview-toolbar";
import { ReviewSummaryStrip } from "./review-summary-strip";
import type { ReviewDocumentRow } from "./review-types";

export type { ReviewDocumentRow } from "./review-types";

const AUTO_RECON_CONFLICT_PREFIX = "AUTO_RECON:conflict|";

function flagNoteInputValue(flagNote: string | null | undefined): string {
  const s = String(flagNote ?? "");
  if (s.startsWith(AUTO_RECON_CONFLICT_PREFIX)) {
    return s.slice(AUTO_RECON_CONFLICT_PREFIX.length);
  }
  return s;
}

function mergeFlagNoteInput(
  previousNote: string | null | undefined,
  humanInput: string,
): string {
  const prev = String(previousNote ?? "");
  if (prev.startsWith(AUTO_RECON_CONFLICT_PREFIX)) {
    return `${AUTO_RECON_CONFLICT_PREFIX}${humanInput}`;
  }
  return humanInput;
}

function fieldHasValue(f: ExtractedField): boolean {
  return String(f.field_value ?? "").trim().length > 0;
}

function reviewFieldSortKey(f: ExtractedField): number {
  const recon = parseLegacyAutoReconNote(f.flag_note);
  const isConflict = recon === "conflict" && f.is_flagged;
  const filled = fieldHasValue(f);
  if (isConflict) return 0;
  if (f.is_flagged) return 1;
  if (filled) return 2;
  return 3;
}

function compareReviewFields(a: ExtractedField, b: ExtractedField): number {
  const da = reviewFieldSortKey(a);
  const db = reviewFieldSortKey(b);
  if (da !== db) return da - db;
  return humanFieldLabel(a.field_name).localeCompare(humanFieldLabel(b.field_name));
}

/* ------------------------------------------------------------------ */

const MARITAL_SPOUSE_KEYS = new Set([
  "marital_status",
  "marital",
  "spouse_name",
  "spouse_full_name",
  "husband_name",
  "wife_name",
  "spouse_nationality",
  "spouse_date_of_birth",
  "spouse_dob",
]);

function isMaritalOrSpouseField(fieldName: string): boolean {
  return MARITAL_SPOUSE_KEYS.has(fieldName.toLowerCase());
}

export function ReviewPageClient({
  applicationId,
  documents,
  initialFields,
  isMinor = false,
}: {
  applicationId: string;
  documents: ReviewDocumentRow[];
  initialFields: ExtractedField[];
  isMinor?: boolean;
}) {
  const router = useRouter();
  const [activeDocId, setActiveDocId] = useState(documents[0]?.id ?? "");
  const [fields, setFields] = useState(initialFields);
  const [hideEmptyFields, setHideEmptyFields] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [previewRotationDeg, setPreviewRotationDeg] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);

  /* Viewer refs */
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 400 });

  /* Drag-to-pan state */
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  /* Print listeners */
  useEffect(() => {
    const onBefore = () => setPrintMode(true);
    const onAfter = () => setPrintMode(false);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  /* Reset zoom/rotation on doc switch */
  useEffect(() => {
    setPreviewRotationDeg(0);
    setPreviewScale(1);
  }, [activeDocId]);

  /* Measure viewer container for proportional zoom */
  useEffect(() => {
    const el = viewerContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const effectiveHideEmpty = printMode ? false : hideEmptyFields;

  /* ---- Computed data ---- */

  const effectiveIsMinor = useMemo(
    () => isMinor || applicantIsMinorFromFields(fields, new Date()),
    [fields, isMinor]
  );

  const fieldsDeduped = useMemo(
    () => dedupeExtractedFieldsLatest(fields as ExtractedFieldRow[]),
    [fields]
  );

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId]
  );

  const activeDocIndex = useMemo(
    () => documents.findIndex((d) => d.id === activeDocId),
    [documents, activeDocId]
  );

  const displayFields = useMemo(
    () =>
      effectiveIsMinor
        ? fieldsDeduped.filter((f) => !isMaritalOrSpouseField(f.field_name))
        : fieldsDeduped,
    [fieldsDeduped, effectiveIsMinor]
  );

  /** Drops legacy or out-of-profile rows for address-proof docs so review stats match the sidebar. */
  const reviewScopedFields = useMemo(
    () =>
      displayFields.filter((f) => {
        if (!ADDRESS_PROOF_SOURCE_DOC_TYPES.has(f.source_doc_type)) return true;
        return ADDRESS_PROOF_FIELD_NAME_SET.has(f.field_name);
      }),
    [displayFields]
  );

  const visibleFields = useMemo(() => {
    if (!activeDoc) return [];
    return reviewScopedFields.filter(
      (f) => f.source_doc_type === activeDoc.doc_type
    );
  }, [reviewScopedFields, activeDoc]);

  const statsByDocId = useMemo(() => {
    const m = new Map<string, DocumentRailStats>();
    for (const d of documents) {
      const list = reviewScopedFields.filter((f) => f.source_doc_type === d.doc_type);
      const filled = list.filter((f) => fieldHasValue(f)).length;
      const conflicts = list.filter(
        (f) =>
          parseLegacyAutoReconNote(f.flag_note) === "conflict" && f.is_flagged
      ).length;
      const manualFlags = list.filter((f) => {
        if (!f.is_flagged) return false;
        return parseLegacyAutoReconNote(f.flag_note) !== "conflict";
      }).length;
      m.set(d.id, { total: list.length, filled, conflicts, manualFlags });
    }
    return m;
  }, [documents, reviewScopedFields]);

  const flaggedCount = useMemo(
    () => reviewScopedFields.filter((f) => f.is_flagged).length,
    [reviewScopedFields]
  );

  const visibleStats = useMemo(() => {
    const withVal = visibleFields.filter(
      (f) => String(f.field_value ?? "").trim().length > 0
    ).length;
    return { total: visibleFields.length, withVal };
  }, [visibleFields]);

  const reviewSummaryStats = useMemo(() => {
    const totalFieldCount = reviewScopedFields.length;
    const filledFieldCount = reviewScopedFields.filter(fieldHasValue).length;
    const conflictFieldCount = reviewScopedFields.filter(
      (f) =>
        parseLegacyAutoReconNote(f.flag_note) === "conflict" && f.is_flagged
    ).length;
    const docsWithConflicts = documents.filter((d) => {
      const st = statsByDocId.get(d.id);
      return (st?.conflicts ?? 0) > 0;
    }).length;
    return {
      conflictFieldCount,
      docsWithConflicts,
      flaggedFieldCount: flaggedCount,
      filledFieldCount,
      totalFieldCount,
    };
  }, [documents, reviewScopedFields, flaggedCount, statsByDocId]);

  const fieldsBySection = useMemo(() => {
    const map = new Map<string, { title: string; fields: ExtractedField[] }>();
    for (const { id, title } of REVIEW_SECTION_ORDER) {
      map.set(id, { title, fields: [] });
    }
    for (const f of visibleFields) {
      const sid = fieldSectionId(f.field_name);
      const bucket = map.get(sid);
      if (bucket) bucket.fields.push(f);
    }
    for (const bucket of map.values()) {
      bucket.fields.sort(compareReviewFields);
    }
    return map;
  }, [visibleFields]);

  /* ---- Actions ---- */

  async function saveField(
    id: string,
    partial: { field_value?: string; is_flagged?: boolean; flag_note?: string }
  ) {
    await fetch(`/api/fields/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
  }

  function updateLocal(id: string, partial: Partial<ExtractedField>) {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...partial } : f))
    );
  }

  async function markReadyToSubmit() {
    const res = await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_submit" }),
    });
    if (res.ok) {
      router.push(`/applications/${applicationId}/fill`);
    }
  }

  /* ---- Prev/Next doc ---- */

  const goToPrevDoc = useCallback(() => {
    if (activeDocIndex > 0) setActiveDocId(documents[activeDocIndex - 1].id);
  }, [activeDocIndex, documents]);

  const goToNextDoc = useCallback(() => {
    if (activeDocIndex < documents.length - 1)
      setActiveDocId(documents[activeDocIndex + 1].id);
  }, [activeDocIndex, documents]);

  /* ---- Drag-to-pan ---- */

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (previewScale <= 1) return;
      const el = scrollRef.current;
      if (!el) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
    },
    [previewScale]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft =
        dragStart.current.scrollLeft - (e.clientX - dragStart.current.x);
      el.scrollTop =
        dragStart.current.scrollTop - (e.clientY - dragStart.current.y);
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  /* ---- Wheel-to-zoom (Ctrl/Cmd + scroll) ---- */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setPreviewScale((s) =>
        Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 100) / 100))
      );
    }
  }, []);

  /* ---- Preview data ---- */

  const previewFileId = activeDoc
    ? parseDriveFileId(activeDoc.drive_file_id, activeDoc.drive_view_url)
    : null;
  const showImage =
    activeDoc && activeDoc.drive_view_url && isImageFileName(activeDoc.file_name);
  const pdfPreviewSrc =
    previewFileId && !showImage ? drivePreviewUrl(previewFileId) : null;

  const contentW = containerSize.w * previewScale;
  const contentH = containerSize.h * previewScale;

  /* ================================================================ */

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* -------- Header -------- */}
      <header className="shrink-0 border-b border-[#e2e8f0] bg-white">
        <div className="flex items-center justify-between px-5 py-2.5">
          <Link
            href={`/applications/${applicationId}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[#475569] transition-colors hover:bg-slate-100 hover:text-[#1e293b]"
          >
            <ArrowLeft className="h-4 w-4" />
            Application
          </Link>
          <h1 className="text-base font-bold tracking-tight text-[#1e293b]">
            Document review
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[#94a3b8] sm:inline">
              {flaggedCount === 0
                ? "No fields flagged"
                : `${flaggedCount} field${flaggedCount === 1 ? "" : "s"} flagged`}
            </span>
            <button
              type="button"
              onClick={() => void markReadyToSubmit()}
              className="no-print inline-flex h-8 items-center gap-1 rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Mark as Ready to Submit
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="px-5 pb-2.5">
          <ReviewSummaryStrip
            conflictFieldCount={reviewSummaryStats.conflictFieldCount}
            docsWithConflicts={reviewSummaryStats.docsWithConflicts}
            flaggedFieldCount={reviewSummaryStats.flaggedFieldCount}
            filledFieldCount={reviewSummaryStats.filledFieldCount}
            totalFieldCount={reviewSummaryStats.totalFieldCount}
          />
        </div>
      </header>

      {/* -------- Body -------- */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Document rail */}
        <div className="no-print hidden w-44 shrink-0 flex-col border-r border-[#e2e8f0] bg-[#f8fafc] lg:flex">
          <ReviewDocumentRail
            documents={documents}
            activeDocId={activeDocId}
            onSelect={setActiveDocId}
            statsByDocId={statsByDocId}
            tabLabel={(d) => documentTabLabel(d.doc_type, d.file_name)}
          />
        </div>

        {/* Resizable preview + fields */}
        <PanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
          {/* -------- Preview panel -------- */}
          <Panel defaultSize={55} minSize={30}>
            <div
              className="flex h-full flex-col"
              data-testid="document-viewer"
            >
              {activeDoc ? (
                <>
                  {/* Prev / Next nav + doc name */}
                  <div className="flex shrink-0 items-center gap-2 border-b border-[#e2e8f0] bg-[#fafbfc] px-4 py-2">
                    <button
                      type="button"
                      aria-label="Previous document"
                      disabled={activeDocIndex <= 0}
                      onClick={goToPrevDoc}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#e2e8f0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-semibold text-[#1e293b]">
                        {activeDoc.file_name ||
                          documentTabLabel(activeDoc.doc_type, "")}
                      </p>
                      <p className="text-[10px] tabular-nums text-[#94a3b8]">
                        {activeDocIndex + 1} of {documents.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Next document"
                      disabled={activeDocIndex >= documents.length - 1}
                      onClick={goToNextDoc}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#e2e8f0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {activeDoc.quality_hint ? (
                    <p className="shrink-0 bg-amber-50 px-4 py-1.5 text-xs leading-snug text-amber-800">
                      {activeDoc.quality_hint}
                    </p>
                  ) : null}

                  {/* Toolbar */}
                  <div className="shrink-0 border-b border-[#e2e8f0] bg-white px-4 py-1.5">
                    <ReviewPreviewToolbar
                      rotationDeg={previewRotationDeg}
                      scale={previewScale}
                      onRotateLeft={() =>
                        setPreviewRotationDeg((d) => (d - 90 + 360) % 360)
                      }
                      onRotateRight={() =>
                        setPreviewRotationDeg((d) => (d + 90) % 360)
                      }
                      onZoomIn={() =>
                        setPreviewScale((s) =>
                          Math.min(
                            ZOOM_MAX,
                            Math.round((s + ZOOM_STEP) * 100) / 100
                          )
                        )
                      }
                      onZoomOut={() =>
                        setPreviewScale((s) =>
                          Math.max(
                            ZOOM_MIN,
                            Math.round((s - ZOOM_STEP) * 100) / 100
                          )
                        )
                      }
                      onReset={() => {
                        setPreviewRotationDeg(0);
                        setPreviewScale(1);
                      }}
                    />
                  </div>

                  {/* Viewer area */}
                  <div
                    ref={viewerContainerRef}
                    className="relative min-h-0 flex-1 bg-[#f1f5f9]"
                  >
                    <div
                      ref={scrollRef}
                      className="absolute inset-0 overflow-auto"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onWheel={handleWheel}
                      style={{
                        cursor: isDragging
                          ? "grabbing"
                          : previewScale > 1
                            ? "grab"
                            : "default",
                      }}
                    >
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: `${Math.max(contentW, containerSize.w)}px`,
                          height: `${Math.max(contentH, containerSize.h)}px`,
                        }}
                      >
                        <div
                          style={{
                            transform: `rotate(${previewRotationDeg}deg)`,
                            transition: "transform 0.15s ease-out",
                          }}
                        >
                          {showImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={activeDoc.drive_view_url}
                              alt=""
                              draggable={false}
                              style={{
                                width: `${contentW * 0.92}px`,
                                height: "auto",
                                maxWidth: "none",
                                userSelect: "none",
                                pointerEvents: "none",
                              }}
                            />
                          ) : pdfPreviewSrc ? (
                            <iframe
                              title="Document preview"
                              src={pdfPreviewSrc}
                              style={{
                                width: `${contentW * 0.96}px`,
                                height: `${contentH * 0.96}px`,
                                border: 0,
                                pointerEvents: isDragging ? "none" : "auto",
                              }}
                            />
                          ) : activeDoc.drive_view_url ? (
                            <iframe
                              title="Document preview"
                              src={activeDoc.drive_view_url}
                              style={{
                                width: `${contentW * 0.96}px`,
                                height: `${contentH * 0.96}px`,
                                border: 0,
                                pointerEvents: isDragging ? "none" : "auto",
                              }}
                            />
                          ) : (
                            <p className="p-4 text-sm text-[#64748b]">
                              No preview URL.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Open in Drive footer */}
                  {activeDoc.drive_view_url ? (
                    <div className="flex shrink-0 items-center gap-2 border-t border-[#e2e8f0] bg-white px-4 py-1.5">
                      <a
                        href={activeDoc.drive_view_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-print inline-flex items-center gap-1 text-xs font-medium text-[#2563eb] transition-colors hover:text-blue-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open in Drive
                      </a>
                      {previewScale > 1 ? (
                        <span className="ml-auto text-[10px] text-[#94a3b8]">
                          Ctrl+scroll to zoom · drag to pan
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-[#64748b]">
                  Select a document
                </div>
              )}
            </div>
          </Panel>

          {/* -------- Resize handle -------- */}
          <PanelResizeHandle className="group relative w-2 shrink-0">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#e2e8f0] transition-colors group-hover:bg-[#2563eb] group-active:bg-[#2563eb]" />
            <div className="absolute left-1/2 top-1/2 hidden h-8 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#e2e8f0] bg-white shadow-sm group-hover:flex">
              <div className="h-4 w-0.5 rounded-full bg-[#94a3b8]" />
            </div>
          </PanelResizeHandle>

          {/* -------- Fields panel -------- */}
          <Panel defaultSize={45} minSize={25}>
            <main className="flex h-full min-w-0 flex-col overflow-y-auto bg-white">
              <div
                className="no-print sticky top-0 z-10 flex flex-col gap-2 border-b border-[#e2e8f0] bg-white px-4 pb-3 pt-3"
                data-testid="review-field-toolbar"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                    Field list
                  </span>
                  <div className="inline-flex rounded-lg border border-[#cbd5e1] bg-slate-100 p-0.5 shadow-inner">
                    <button
                      type="button"
                      className={clsx(
                        "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150",
                        !hideEmptyFields
                          ? "bg-white text-[#0f172a] shadow-sm"
                          : "text-[#64748b] hover:text-[#334155]"
                      )}
                      onClick={() => setHideEmptyFields(false)}
                    >
                      Show all fields
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150",
                        hideEmptyFields
                          ? "bg-white text-[#0f172a] shadow-sm"
                          : "text-[#64748b] hover:text-[#334155]"
                      )}
                      onClick={() => setHideEmptyFields(true)}
                    >
                      Hide empty
                    </button>
                  </div>
                </div>
                <span className="text-[11px] text-[#64748b]">
                  {visibleStats.withVal} with values
                  {visibleStats.total !== visibleStats.withVal
                    ? ` · ${visibleStats.total - visibleStats.withVal} empty`
                    : ""}{" "}
                  on this document
                  {!hideEmptyFields &&
                  visibleStats.total > visibleStats.withVal ? (
                    <span className="text-[#94a3b8]">
                      {" "}
                      — Use Hide empty to scan faster.
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
                {REVIEW_SECTION_ORDER.map(({ id: sectionId, title }) => {
                  const bucket = fieldsBySection.get(sectionId);
                  if (!bucket?.fields.length) return null;
                  const rows = effectiveHideEmpty
                    ? bucket.fields.filter(fieldHasValue)
                    : bucket.fields;
                  const emptyInSection = bucket.fields.length - rows.length;
                  if (!rows.length) {
                    return (
                      <section key={sectionId} className="mb-6 last:mb-0">
                        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                          {title}{" "}
                          <span className="font-normal normal-case text-[#94a3b8]">
                            ({bucket.fields.length} empty)
                          </span>
                        </h2>
                        <p className="text-xs text-[#94a3b8]">
                          {effectiveHideEmpty ? (
                            <>
                              All fields empty in this section.{" "}
                              <button
                                type="button"
                                className="font-medium text-[#2563eb] underline-offset-2 hover:underline"
                                onClick={() => setHideEmptyFields(false)}
                              >
                                Show all fields
                              </button>
                            </>
                          ) : null}
                        </p>
                      </section>
                    );
                  }
                  return (
                    <section key={sectionId} className="mb-6 last:mb-0">
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                        {title}{" "}
                        <span className="font-normal normal-case text-[#94a3b8]">
                          ({rows.length}
                          {emptyInSection > 0 && effectiveHideEmpty
                            ? ` shown · ${emptyInSection} hidden`
                            : ""}
                          )
                        </span>
                      </h2>
                      <div className="rounded-lg border border-[#e2e8f0] bg-[#fafafa] shadow-sm">
                        {rows.map((f) => {
                          const label = humanFieldLabel(f.field_name);
                          const source = sourceDocumentLabel(f.source_doc_type);
                          const empty = !fieldHasValue(f);
                          const recon = parseLegacyAutoReconNote(f.flag_note);
                          const isConflict =
                            recon === "conflict" && f.is_flagged;
                          const conflictSources = isConflict
                            ? parseConflictSourcesFromFlagNote(f.flag_note)
                            : [];
                          const manualFlag =
                            f.is_flagged && recon !== "conflict";

                          return (
                            <div
                              key={f.id}
                              className={clsx(
                                "border-b border-[#e2e8f0] px-3 py-3 last:border-b-0",
                                isConflict &&
                                  "border-l-4 border-l-red-500 bg-red-50/90",
                                !isConflict &&
                                  f.is_flagged &&
                                  "border-l-4 border-l-amber-400 bg-amber-50/50",
                                !f.is_flagged && empty && "bg-slate-50/60",
                                !f.is_flagged && !empty && "bg-white"
                              )}
                              data-flagged={f.is_flagged ? "true" : "false"}
                              data-review-empty={empty ? "true" : "false"}
                            >
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <label
                                      className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]"
                                      htmlFor={`field-${f.id}`}
                                    >
                                      {label}
                                    </label>
                                    {isConflict ? (
                                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                                        Conflict
                                      </span>
                                    ) : null}
                                    {manualFlag ? (
                                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                                        Needs review
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 text-[10px] leading-tight text-[#94a3b8]">
                                    {source}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  aria-label={`Flag field ${label}`}
                                  className={clsx(
                                    "no-print shrink-0 rounded border px-2 py-1 text-sm leading-none transition-colors",
                                    f.is_flagged
                                      ? "border-red-400 bg-red-100 text-red-800"
                                      : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-slate-50"
                                  )}
                                  onClick={() => {
                                    const next = !f.is_flagged;
                                    updateLocal(f.id, {
                                      is_flagged: next,
                                      ...(!next ? { flag_note: "" } : {}),
                                    });
                                    void saveField(f.id, {
                                      is_flagged: next,
                                      ...(!next ? { flag_note: "" } : {}),
                                    });
                                  }}
                                >
                                  🚩
                                </button>
                              </div>

                              <div
                                className={clsx(
                                  "mt-2",
                                  isConflict &&
                                    "space-y-3 rounded-lg border border-red-200/80 bg-white/90 p-3 shadow-sm"
                                )}
                              >
                                {isConflict ? (
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#0f172a]">
                                    Value to submit
                                  </p>
                                ) : null}
                                <input
                                  id={`field-${f.id}`}
                                  aria-label={`Field value for ${f.field_name}`}
                                  className={clsx(
                                    "w-full rounded border px-2 py-1.5 text-sm text-[#0f172a] outline-none transition-colors focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20",
                                    isConflict || f.is_flagged
                                      ? "border-red-400 bg-white font-medium shadow-sm"
                                      : "border-[#e2e8f0] bg-white",
                                    empty &&
                                      !f.is_flagged &&
                                      "text-[#94a3b8]"
                                  )}
                                  placeholder="—"
                                  value={f.field_value ?? ""}
                                  onChange={(e) =>
                                    updateLocal(f.id, {
                                      field_value: e.target.value,
                                    })
                                  }
                                  onBlur={(e) =>
                                    void saveField(f.id, {
                                      field_value: e.currentTarget.value,
                                    })
                                  }
                                />
                                {isConflict && conflictSources.length > 0 ? (
                                  <div className="rounded-md border border-red-200/90 bg-red-50/60 px-3 py-2.5">
                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-red-950">
                                      Sources (extracted)
                                    </p>
                                    <ul className="space-y-2 text-xs leading-relaxed text-[#334155]">
                                      {conflictSources.map((line, i) => (
                                        <li
                                          key={`${f.id}-src-${i}`}
                                          className="border-l-2 border-red-300 pl-2"
                                        >
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>

                              {f.is_flagged ? (
                                <div className="no-print mt-2 border-t border-[#e2e8f0]/80 pt-2">
                                  <label
                                    className="mb-1 block text-[10px] font-semibold text-[#64748b]"
                                    htmlFor={`flag-note-${f.id}`}
                                  >
                                    {isAutoReconConflictNote(f.flag_note)
                                      ? "Conflict detail (editable)"
                                      : "Flag note"}
                                  </label>
                                  <input
                                    id={`flag-note-${f.id}`}
                                    aria-label={`Flag note for ${f.field_name}`}
                                    className="w-full rounded border border-red-400 bg-red-50/80 px-2 py-1.5 text-xs text-[#0f172a] outline-none focus:ring-2 focus:ring-red-300/40"
                                    placeholder="Flag note"
                                    value={flagNoteInputValue(f.flag_note)}
                                    onChange={(e) =>
                                      updateLocal(f.id, {
                                        flag_note: mergeFlagNoteInput(
                                          f.flag_note,
                                          e.target.value
                                        ),
                                      })
                                    }
                                    onBlur={(e) => {
                                      const merged = mergeFlagNoteInput(
                                        f.flag_note,
                                        e.currentTarget.value
                                      );
                                      void saveField(f.id, {
                                        is_flagged: true,
                                        flag_note: merged,
                                      });
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </main>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
