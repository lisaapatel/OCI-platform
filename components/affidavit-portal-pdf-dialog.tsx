"use client";

import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ChecklistItem = {
  doc_type: string;
  label: string;
  required: boolean;
  optionalNote?: string;
};
const AFFIDAVIT_MAX_LINES = 7;

export function AffidavitPortalPdfButton({
  applicationId,
  appNumber,
  title,
  description,
  rowTitleClassName,
  descClassName,
}: {
  applicationId: string;
  appNumber: string;
  title: string;
  description?: string;
  rowTitleClassName: string;
  descClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [uploadedDocTypes, setUploadedDocTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customLineInputs, setCustomLineInputs] = useState<string[]>([]);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/affidavit-options`,
        { method: "GET", cache: "no-store" },
      );
      const data = (await res.json()) as {
        error?: string;
        checklist?: ChecklistItem[];
        uploadedDocTypes?: string[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load affidavit options.");
      }
      const list = data.checklist ?? [];
      const uploaded = new Set(data.uploadedDocTypes ?? []);
      setChecklist(list);
      setUploadedDocTypes([...(data.uploadedDocTypes ?? [])]);
      const init: Record<string, boolean> = {};
      for (const row of list) {
        init[row.doc_type] = uploaded.has(row.doc_type);
      }
      setSelected(init);
      setCustomLineInputs([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (open) void loadOptions();
  }, [open, loadOptions]);

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );
  const remainingSlots = Math.max(0, AFFIDAVIT_MAX_LINES - selectedCount);
  useEffect(() => {
    setCustomLineInputs((prev) => {
      const next = prev.slice(0, remainingSlots);
      while (next.length < remainingSlots) next.push("");
      return next;
    });
  }, [remainingSlots]);
  const customLines = useMemo(
    () =>
      customLineInputs
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    [customLineInputs],
  );
  const usedLinesCount = selectedCount + customLines.length;

  const toggle = (docType: string) => {
    setSelected((prev) => ({ ...prev, [docType]: !prev[docType] }));
  };

  const handleDownload = async () => {
    const ordered: string[] = [];
    for (const row of checklist) {
      if (selected[row.doc_type]) ordered.push(row.doc_type);
    }
    if (usedLinesCount === 0) {
      setError("Select at least one document or add one custom line.");
      return;
    }
    if (usedLinesCount > AFFIDAVIT_MAX_LINES) {
      setError("Select at most seven documents (lines (a) through (g)).");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/pdfs/affidavit-in-lieu`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedDocTypes: ordered,
            customLines,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `affidavit_in_lieu_of_originals_${appNumber || applicationId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="block w-full rounded-md text-left text-[#1e3a5f] underline decoration-[#1e3a5f]/40 underline-offset-2 transition-colors hover:bg-slate-50 hover:decoration-[#1e3a5f]"
        >
          <span className={rowTitleClassName}>{title}</span>
          {description ? (
            <span className={clsx(descClassName, "block")}>{description}</span>
          ) : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(100vw-24px,420px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-slate-200 bg-white p-0 shadow-lg outline-none">
          <div className="border-b border-slate-100 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-slate-900">
              Documents in this packet
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-snug text-slate-500">
              Check every document included in the physical packet. We pre-check
              items that have an upload in this portal—confirm or adjust before
              downloading.
            </Dialog.Description>
          </div>
          <div className="max-h-[min(55vh,420px)] overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                Loading checklist…
              </div>
            ) : (
              <ul className="space-y-2.5">
                {checklist.map((row) => (
                  <li key={row.doc_type}>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                        checked={selected[row.doc_type] === true}
                        onChange={() => toggle(row.doc_type)}
                      />
                      <span>
                        <span className="font-medium">{row.label}</span>
                        {uploadedDocTypes.includes(row.doc_type) ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            (uploaded)
                          </span>
                        ) : null}
                        {row.optionalNote ? (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {row.optionalNote}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {!loading ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <label className="block text-xs font-medium text-slate-700">
                  Additional lines ({remainingSlots} available)
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Fill any remaining slots with custom text.
                </p>
                {remainingSlots === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    All 7 lines are already used by selected checklist items.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {customLineInputs.map((value, idx) => (
                      <input
                        key={`custom-line-${idx}`}
                        value={value}
                        onChange={(e) =>
                          setCustomLineInputs((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={`Custom line ${idx + 1}`}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]"
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
            <p className="text-xs text-slate-500">
              {usedLinesCount} of {AFFIDAVIT_MAX_LINES} lines used
            </p>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={loading || submitting || checklist.length === 0}
                onClick={() => void handleDownload()}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#152a45] disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Generating…
                  </>
                ) : (
                  "Download PDF"
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
