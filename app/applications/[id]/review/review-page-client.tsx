"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { ExtractedField } from "@/lib/types";
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

export type ReviewDocumentRow = {
  id: string;
  doc_type: string;
  file_name: string;
  drive_view_url: string;
  drive_file_id: string;
};

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

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId]
  );

  const visibleFields = useMemo(() => {
    if (!activeDoc) return [];
    return fields.filter((f) => f.source_doc_type === activeDoc.doc_type);
  }, [fields, activeDoc]);

  const flaggedCount = useMemo(
    () => fields.filter((f) => f.is_flagged).length,
    [fields]
  );

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
      bucket.fields.sort((a, b) =>
        humanFieldLabel(a.field_name).localeCompare(
          humanFieldLabel(b.field_name)
        )
      );
    }
    return map;
  }, [visibleFields]);

  const anyFlagged = flaggedCount > 0;

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

  const previewFileId = activeDoc
    ? parseDriveFileId(activeDoc.drive_file_id, activeDoc.drive_view_url)
    : null;
  const showImage =
    activeDoc && activeDoc.drive_view_url && isImageFileName(activeDoc.file_name);
  const pdfPreviewSrc =
    previewFileId && !showImage ? drivePreviewUrl(previewFileId) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="shrink-0 border-b border-black/10 px-6 py-4">
        <Link
          href={`/applications/${applicationId}`}
          className="text-sm text-black/55 hover:text-black"
        >
          ← Application
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Document review
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden px-6 pb-28 pt-4">
        <aside className="flex w-[40%] min-w-0 flex-col border-r border-black/10 pr-4">
          <div className="no-print flex flex-wrap gap-2 border-b border-black/10 pb-3">
            {documents.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={d.id === activeDocId}
                onClick={() => setActiveDocId(d.id)}
                className={clsx(
                  "rounded-md px-3 py-2 text-sm font-medium",
                  d.id === activeDocId
                    ? "bg-black text-white"
                    : "bg-zinc-100 text-black hover:bg-zinc-200"
                )}
              >
                {documentTabLabel(d.doc_type, d.file_name)}
              </button>
            ))}
          </div>

          {activeDoc ? (
            <div
              className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-black/10 bg-zinc-50 p-4"
              data-testid="document-viewer"
            >
              <p className="shrink-0 text-sm font-medium text-black/70">
                {activeDoc.file_name || documentTabLabel(activeDoc.doc_type, "")}
              </p>
              <div className="mt-2 min-h-[320px] flex-1 overflow-hidden rounded-md border border-black/10 bg-white">
                {showImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeDoc.drive_view_url}
                    alt=""
                    className="max-h-[min(480px,60vh)] w-full object-contain"
                  />
                ) : pdfPreviewSrc ? (
                  <iframe
                    title="Document preview"
                    src={pdfPreviewSrc}
                    className="h-[min(480px,60vh)] w-full border-0"
                  />
                ) : activeDoc.drive_view_url ? (
                  <iframe
                    title="Document preview"
                    src={activeDoc.drive_view_url}
                    className="h-[min(480px,60vh)] w-full border-0"
                  />
                ) : (
                  <p className="p-4 text-sm text-black/50">No preview URL.</p>
                )}
              </div>
              {activeDoc.drive_view_url ? (
                <a
                  href={activeDoc.drive_view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-print mt-3 text-sm font-medium text-blue-700 underline hover:text-blue-900"
                >
                  Open in Drive
                </a>
              ) : null}
            </div>
          ) : null}
        </aside>

        <main className="flex w-[60%] min-w-0 flex-col overflow-y-auto pl-4">
          {REVIEW_SECTION_ORDER.map(({ id: sectionId, title }) => {
            const bucket = fieldsBySection.get(sectionId);
            if (!bucket?.fields.length) return null;
            return (
              <section key={sectionId} className="mb-8 last:mb-0">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-black/50">
                  {title}
                </h2>
                <div className="space-y-4">
                  {bucket.fields.map((f) => {
                    const label = humanFieldLabel(f.field_name);
                    const source = sourceDocumentLabel(f.source_doc_type);
                    return (
                      <div
                        key={f.id}
                        className="rounded-xl border border-black/10 bg-white p-4"
                        data-flagged={f.is_flagged ? "true" : "false"}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            className="text-sm font-semibold text-black"
                            htmlFor={`field-${f.id}`}
                          >
                            {label}
                          </label>
                          <button
                            type="button"
                            aria-label={`Flag field ${label}`}
                            className="no-print rounded-md border border-black/15 px-2 py-1 text-base leading-none"
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
                        <input
                          id={`field-${f.id}`}
                          aria-label={`Field value for ${f.field_name}`}
                          className={clsx(
                            "mt-2 w-full rounded-md border px-3 py-2 text-sm",
                            f.is_flagged
                              ? "border-2 border-red-500"
                              : "border border-black/10"
                          )}
                          value={f.field_value ?? ""}
                          onChange={(e) =>
                            updateLocal(f.id, { field_value: e.target.value })
                          }
                          onBlur={(e) =>
                            void saveField(f.id, {
                              field_value: e.currentTarget.value,
                            })
                          }
                        />
                        <p className="mt-1.5 text-xs text-black/45">
                          Source: {source}
                        </p>
                        {f.is_flagged ? (
                          <input
                            aria-label={`Flag note for ${f.field_name}`}
                            className="mt-2 w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm"
                            placeholder="Flag note"
                            value={f.flag_note ?? ""}
                            onChange={(e) =>
                              updateLocal(f.id, { flag_note: e.target.value })
                            }
                            onBlur={(e) =>
                              void saveField(f.id, {
                                is_flagged: true,
                                flag_note: e.currentTarget.value,
                              })
                            }
                          />
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

      <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-4 border-t border-black/10 bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <p className="text-sm text-black/70">
          {flaggedCount === 0
            ? "No fields flagged"
            : `${flaggedCount} field${flaggedCount === 1 ? "" : "s"} flagged`}
        </p>
        <button
          type="button"
          disabled={anyFlagged}
          onClick={() => void markReadyToSubmit()}
          className="no-print inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark as Ready to Submit
        </button>
      </div>
    </div>
  );
}
