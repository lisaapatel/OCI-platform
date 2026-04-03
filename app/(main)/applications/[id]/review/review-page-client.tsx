"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  dedupeExtractedFieldsLatest,
  type ExtractedFieldRow,
} from "@/lib/extracted-fields-dedupe";
import { parseAutoReconNote } from "@/lib/cross-doc-reconcile/constants";
import {
  isAutoReconConflictNote,
  parseConflictSourcesFromFlagNote,
} from "@/lib/review-conflict-display";
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
  const recon = parseAutoReconNote(f.flag_note);
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

export function ReviewPageClient({
  applicationId,
  documents,
  initialFields,
}: {
  applicationId: string;
  documents: ReviewDocumentRow[];
  initialFields: ExtractedField[];
}) {
  const router = useRouter();
  const [activeDocId, setActiveDocId] = useState(documents[0]?.id ?? "");
  const [fields, setFields] = useState(initialFields);
  /** Opt-in: hiding empty rows while editing would collapse the row after clear, so default off. */
  const [hideEmptyFields, setHideEmptyFields] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [previewRotationDeg, setPreviewRotationDeg] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);

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

  useEffect(() => {
    setPreviewRotationDeg(0);
    setPreviewScale(1);
  }, [activeDocId]);

  const effectiveHideEmpty = printMode ? false : hideEmptyFields;

  const fieldsDeduped = useMemo(
    () => dedupeExtractedFieldsLatest(fields as ExtractedFieldRow[]),
    [fields]
  );

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId]
  );

  const visibleFields = useMemo(() => {
    if (!activeDoc) return [];
    return fieldsDeduped.filter((f) => f.source_doc_type === activeDoc.doc_type);
  }, [fieldsDeduped, activeDoc]);

  const statsByDocId = useMemo(() => {
    const m = new Map<string, DocumentRailStats>();
    for (const d of documents) {
      const list = fieldsDeduped.filter((f) => f.source_doc_type === d.doc_type);
      const filled = list.filter((f) => fieldHasValue(f)).length;
      const conflicts = list.filter(
        (f) => parseAutoReconNote(f.flag_note) === "conflict" && f.is_flagged
      ).length;
      const manualFlags = list.filter((f) => {
        if (!f.is_flagged) return false;
        return parseAutoReconNote(f.flag_note) !== "conflict";
      }).length;
      m.set(d.id, {
        total: list.length,
        filled,
        conflicts,
        manualFlags,
      });
    }
    return m;
  }, [documents, fieldsDeduped]);

  const flaggedCount = useMemo(
    () => fieldsDeduped.filter((f) => f.is_flagged).length,
    [fieldsDeduped]
  );

  const visibleStats = useMemo(() => {
    const withVal = visibleFields.filter(
      (f) => String(f.field_value ?? "").trim().length > 0
    ).length;
    return { total: visibleFields.length, withVal };
  }, [visibleFields]);

  /** App-wide counts for header orientation (deduped fields only). */
  const reviewSummaryStats = useMemo(() => {
    const totalFieldCount = fieldsDeduped.length;
    const filledFieldCount = fieldsDeduped.filter(fieldHasValue).length;
    const conflictFieldCount = fieldsDeduped.filter(
      (f) => parseAutoReconNote(f.flag_note) === "conflict" && f.is_flagged
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
  }, [documents, fieldsDeduped, flaggedCount, statsByDocId]);

  const fieldsBySection = useMemo(() => {
    const map = new Map<
      string,
      { title: string; fields: ExtractedField[] }
    >();
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

  async function refreshReconciliation() {
    const res = await fetch("/api/reconcile/application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_id: applicationId }),
    });
    const j = (await res.json()) as { ok?: boolean; fields?: ExtractedField[] };
    if (res.ok && Array.isArray(j.fields)) {
      setFields(j.fields);
    }
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

  const previewFileId = activeDoc
    ? parseDriveFileId(activeDoc.drive_file_id, activeDoc.drive_view_url)
    : null;
  const showImage =
    activeDoc && activeDoc.drive_view_url && isImageFileName(activeDoc.file_name);
  const pdfPreviewSrc =
    previewFileId && !showImage ? drivePreviewUrl(previewFileId) : null;

  const previewTransformStyle = {
    transform: `rotate(${previewRotationDeg}deg) scale(${previewScale})`,
    transformOrigin: "center center" as const,
    transition: "transform 0.15s ease-out",
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="shrink-0 border-b border-[#e2e8f0] bg-white px-6 py-4">
        <Link
          href={`/applications/${applicationId}`}
          className="text-sm font-medium text-[#2563eb] transition-colors duration-150 hover:text-blue-700"
        >
          ← Application
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1e293b]">
          Document review
        </h1>
        <ReviewSummaryStrip
          conflictFieldCount={reviewSummaryStats.conflictFieldCount}
          docsWithConflicts={reviewSummaryStats.docsWithConflicts}
          flaggedFieldCount={reviewSummaryStats.flaggedFieldCount}
          filledFieldCount={reviewSummaryStats.filledFieldCount}
          totalFieldCount={reviewSummaryStats.totalFieldCount}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-28 pt-4 lg:grid lg:min-h-0 lg:grid-cols-[minmax(10rem,12rem)_minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-stretch lg:gap-4 lg:overflow-hidden">
        <div className="flex min-h-0 shrink-0 flex-col lg:h-full lg:min-h-0 lg:border-r lg:border-[#e2e8f0] lg:bg-[#f8fafc] lg:pr-2">
          <ReviewDocumentRail
            documents={documents}
            activeDocId={activeDocId}
            onSelect={setActiveDocId}
            statsByDocId={statsByDocId}
            tabLabel={(d) => documentTabLabel(d.doc_type, d.file_name)}
          />
        </div>

        <div className="flex min-h-[min(280px,45vh)] min-w-0 flex-1 flex-col lg:min-h-0">
          {activeDoc ? (
            <div
              className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-sm transition-shadow duration-150 hover:shadow-md lg:p-4"
              data-testid="document-viewer"
            >
              <p className="shrink-0 text-sm font-semibold text-[#64748b]">
                {activeDoc.file_name || documentTabLabel(activeDoc.doc_type, "")}
              </p>
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
                    Math.min(ZOOM_MAX, Math.round((s + ZOOM_STEP) * 100) / 100)
                  )
                }
                onZoomOut={() =>
                  setPreviewScale((s) =>
                    Math.max(ZOOM_MIN, Math.round((s - ZOOM_STEP) * 100) / 100)
                  )
                }
                onReset={() => {
                  setPreviewRotationDeg(0);
                  setPreviewScale(1);
                }}
              />
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-2">
                <div className="flex min-h-[min(320px,50vh)] w-full items-center justify-center lg:min-h-[min(400px,calc(100dvh-15rem))]">
                  <div style={previewTransformStyle} className="inline-block">
                    {showImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeDoc.drive_view_url}
                        alt=""
                        className="max-h-[min(480px,55vh)] w-auto max-w-full object-contain lg:max-h-[min(72vh,calc(100dvh-14rem))]"
                      />
                    ) : pdfPreviewSrc ? (
                      <iframe
                        title="Document preview"
                        src={pdfPreviewSrc}
                        className="h-[min(480px,55vh)] w-[min(100%,720px)] min-w-[240px] border-0 lg:h-[min(72vh,calc(100dvh-14rem))]"
                      />
                    ) : activeDoc.drive_view_url ? (
                      <iframe
                        title="Document preview"
                        src={activeDoc.drive_view_url}
                        className="h-[min(480px,55vh)] w-[min(100%,720px)] min-w-[240px] border-0 lg:h-[min(72vh,calc(100dvh-14rem))]"
                      />
                    ) : (
                      <p className="p-4 text-sm text-[#64748b]">No preview URL.</p>
                    )}
                  </div>
                </div>
              </div>
              {activeDoc.drive_view_url ? (
                <a
                  href={activeDoc.drive_view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-print mt-2 shrink-0 text-sm font-medium text-[#2563eb] underline-offset-2 transition-colors duration-150 hover:text-blue-700"
                >
                  Open in Drive
                </a>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafc] p-6 text-sm text-[#64748b]">
              Select a document
            </div>
          )}
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto border-t border-[#e2e8f0] bg-white pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div
            className="no-print sticky top-0 z-10 mb-4 flex flex-col gap-3 border-b border-[#e2e8f0] bg-white pb-4 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            data-testid="review-field-toolbar"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                Field list
              </span>
              <div className="inline-flex rounded-lg border border-[#cbd5e1] bg-slate-100 p-1 shadow-inner">
                <button
                  type="button"
                  className={clsx(
                    "rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-150",
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
                    "rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-150",
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
            <span className="text-xs text-[#64748b]">
              {visibleStats.withVal} with values
              {visibleStats.total !== visibleStats.withVal
                ? ` · ${visibleStats.total - visibleStats.withVal} empty`
                : ""}{" "}
              on this document
              {!hideEmptyFields && visibleStats.total > visibleStats.withVal ? (
                <span className="block text-[#94a3b8] sm:inline sm:before:content-['—_']">
                  Use Hide empty to scan faster.
                </span>
              ) : null}
            </span>
          </div>

          {REVIEW_SECTION_ORDER.map(({ id: sectionId, title }) => {
            const bucket = fieldsBySection.get(sectionId);
            if (!bucket?.fields.length) return null;
            const rows = effectiveHideEmpty
              ? bucket.fields.filter(fieldHasValue)
              : bucket.fields;
            const emptyInSection =
              bucket.fields.length - rows.length;
            if (!rows.length) {
              return (
                <section key={sectionId} className="mb-8 last:mb-0">
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
              <section key={sectionId} className="mb-8 last:mb-0">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
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
                    const recon = parseAutoReconNote(f.flag_note);
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
                          "border-b border-[#e2e8f0] px-4 py-3.5 last:border-b-0",
                          isConflict &&
                            "border-l-4 border-l-red-500 bg-red-50/90",
                          !isConflict &&
                            f.is_flagged &&
                            "border-l-4 border-l-amber-400 bg-amber-50/50",
                          !f.is_flagged &&
                            empty &&
                            "bg-slate-50/60",
                          !f.is_flagged &&
                            !empty &&
                            "bg-white"
                        )}
                        data-flagged={f.is_flagged ? "true" : "false"}
                        data-review-empty={empty ? "true" : "false"}
                      >
                        <div className="flex flex-wrap items-start gap-x-2 gap-y-2 sm:grid sm:grid-cols-[minmax(0,34%)_1fr_auto] sm:items-start sm:gap-x-4">
                          <div className="min-w-0 sm:pr-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <label
                                className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]"
                                htmlFor={`field-${f.id}`}
                              >
                                {label}
                              </label>
                              {recon === "confirmed" && !f.is_flagged ? (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                                  OK
                                </span>
                              ) : null}
                              {recon === "single_source" && !f.is_flagged ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                  1 src
                                </span>
                              ) : null}
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
                          <div
                            className={clsx(
                              "min-w-0 sm:col-span-1",
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
                                "min-w-0 w-full rounded border px-2 py-1.5 text-sm text-[#0f172a] outline-none transition-colors focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20",
                                isConflict || f.is_flagged
                                  ? "border-red-400 bg-white font-medium shadow-sm"
                                  : "border-[#e2e8f0] bg-white",
                                empty && !f.is_flagged && "text-[#94a3b8]"
                              )}
                              placeholder="—"
                              value={f.field_value ?? ""}
                              onChange={(e) =>
                                updateLocal(f.id, {
                                  field_value: e.target.value,
                                })
                              }
                              onBlur={(e) =>
                                void (async () => {
                                  await saveField(f.id, {
                                    field_value: e.currentTarget.value,
                                  });
                                  await refreshReconciliation();
                                })()
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
                              void (async () => {
                                await saveField(f.id, {
                                  is_flagged: next,
                                  ...(!next ? { flag_note: "" } : {}),
                                });
                                await refreshReconciliation();
                              })();
                            }}
                          >
                            🚩
                          </button>
                        </div>
                        {f.is_flagged ? (
                          <div className="no-print mt-3 border-t border-[#e2e8f0]/80 pt-3 sm:ml-[34%] sm:max-w-[calc(66%-2rem)]">
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
                              onBlur={(e) =>
                                void (async () => {
                                  const merged = mergeFlagNoteInput(
                                    f.flag_note,
                                    e.currentTarget.value
                                  );
                                  await saveField(f.id, {
                                    is_flagged: true,
                                    flag_note: merged,
                                  });
                                  await refreshReconciliation();
                                })()
                              }
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
        </main>
      </div>

      <div className="fixed bottom-0 left-56 right-0 z-20 flex flex-col gap-3 border-t border-[#e2e8f0] bg-[#1e3a5f] px-6 py-4 text-white shadow-[0_-4px_12px_rgba(0,0,0,0.12)]">
        <div className="no-print rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-xs text-white/95">
          Before marking ready: on the application page, confirm{" "}
          <strong>Govt portal readiness</strong> is green (PDFs within limit,
          photo &amp; signature valid). Missing or oversize uploads on the
          official portal can cause rejection.
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-white/90">
            {flaggedCount === 0
              ? "No fields flagged"
              : `${flaggedCount} field${flaggedCount === 1 ? "" : "s"} flagged`}
          </p>
          <button
            type="button"
            onClick={() => void markReadyToSubmit()}
            className="no-print inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-700"
          >
            Mark as Ready to Submit
          </button>
        </div>
      </div>
    </div>
  );
}
