"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FORM_FILL_ALL_FIELDS,
  FORM_FILL_SECTIONS,
  resolveFormFillField,
} from "@/lib/form-fill-sections";
import type { ExtractedField } from "@/lib/types";

const fieldStableId = (sectionTitle: string, label: string) =>
  `${sectionTitle}::${label}`;

export function FormFillPageClient({
  applicationId,
  appNumber,
  customerName,
  lastReviewedLabel,
  initialFields,
}: {
  applicationId: string;
  appNumber: string;
  customerName: string;
  lastReviewedLabel: string;
  initialFields: ExtractedField[];
}) {
  const byName = useMemo(() => {
    const m = new Map<string, ExtractedField>();
    for (const f of initialFields) {
      m.set(f.field_name, f);
    }
    return m;
  }, [initialFields]);

  const totalFields = FORM_FILL_ALL_FIELDS.length;

  const { withValues, flaggedCount } = useMemo(() => {
    let withVals = 0;
    let flagged = 0;
    for (const def of FORM_FILL_ALL_FIELDS) {
      const { row } = resolveFormFillField(byName, def);
      const v = row?.field_value != null ? String(row.field_value).trim() : "";
      if (v !== "") withVals += 1;
      if (row?.is_flagged) flagged += 1;
    }
    return { withValues: withVals, flaggedCount: flagged };
  }, [byName]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedId) return;
    const t = window.setTimeout(() => setCopiedId(null), 2000);
    return () => window.clearTimeout(t);
  }, [copiedId]);

  const copyValue = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
    } catch {
      setCopiedId(null);
    }
  }, []);

  return (
    <div className="fill-print-root mx-auto flex min-h-screen max-w-4xl flex-col gap-8 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <header className="no-print rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={`/applications/${applicationId}/review`}
              className="text-sm font-medium text-[#2563eb] transition-colors duration-150 hover:text-blue-700"
            >
              Back to Review
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
              <span>{appNumber}</span>
              <span className="mx-2 font-normal text-[#64748b]">·</span>
              <span>{customerName}</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-4 text-sm font-medium text-[#1e293b] transition-colors duration-150 hover:bg-[#eff6ff]"
          >
            Print
          </button>
        </div>
      </header>

      <div
        className="fill-print-summary no-print rounded-xl border border-[#e2e8f0] bg-white p-4 text-sm shadow-sm"
        data-testid="form-fill-summary"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-[#64748b]">Total fields</span>
            <div className="text-lg font-semibold" data-testid="summary-total">
              {totalFields}
            </div>
          </div>
          <div>
            <span className="text-[#64748b]">Fields with values</span>
            <div
              className="text-lg font-semibold"
              data-testid="summary-with-values"
            >
              {withValues}
            </div>
          </div>
          <div>
            <span className="text-[#64748b]">Flagged fields</span>
            <div
              className={clsx(
                "text-lg font-semibold",
                flaggedCount > 0 && "text-[#dc2626]"
              )}
              data-testid="summary-flagged"
            >
              {flaggedCount}
            </div>
          </div>
          <div>
            <span className="text-[#64748b]">Last reviewed</span>
            <div
              className="text-lg font-semibold text-[#1e293b]"
              data-testid="summary-last-reviewed"
            >
              {lastReviewedLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden print:block print:mb-4 print:border-b print:border-black/20 print:pb-3">
        <p className="text-[11pt] font-semibold text-black">
          {appNumber} · {customerName}
        </p>
        <p className="mt-1 text-[9pt] text-black/60">
          Total {totalFields} fields · {withValues} with values
          {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ""}
          {lastReviewedLabel !== "—"
            ? ` · Last reviewed ${lastReviewedLabel}`
            : ""}
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {FORM_FILL_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-4">
            <h2 className="fill-print-section-title border-b border-blue-200 pb-2 text-lg font-bold text-[#1e3a5f]">
              {section.title}
            </h2>
            <div className="space-y-4">
              {section.fields.map((def) => {
                const { row, matchedKey } = resolveFormFillField(byName, def);
                const raw = row?.field_value;
                const hasValue = raw != null && String(raw).trim() !== "";
                const display = hasValue ? String(raw) : null;
                const stableId = fieldStableId(section.title, def.label);
                const isCopied = copiedId === stableId;

                return (
                  <div
                    key={stableId}
                    className="fill-field-card flex flex-col gap-1 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md print:grid print:grid-cols-[minmax(132px,32%)_minmax(0,1fr)] print:items-start print:gap-x-6 print:gap-y-1 print:shadow-none"
                    data-field-key={matchedKey}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                      {def.label}
                    </span>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p
                        className={clsx(
                          "min-w-0 flex-1 text-lg font-medium leading-snug tracking-tight sm:text-xl",
                          hasValue
                            ? "text-[#1e293b]"
                            : "italic text-[#dc2626]"
                        )}
                        data-empty={!hasValue ? "true" : "false"}
                      >
                        {hasValue ? display : "— Not found —"}
                      </p>
                      {hasValue ? (
                        <button
                          type="button"
                          className="no-print shrink-0 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb] transition-colors duration-150 hover:bg-blue-100"
                          onClick={() => void copyValue(display!, stableId)}
                        >
                          {isCopied ? "Copied!" : "Copy"}
                        </button>
                      ) : null}
                    </div>
                    {row?.is_flagged ? (
                      <div className="mt-2 border-l-4 border-[#d97706] bg-yellow-50 px-3 py-2 text-sm text-amber-950 print:border-amber-400">
                        <span className="mr-1.5" aria-hidden>
                          ⚠️
                        </span>
                        {row.flag_note?.trim() || "Flagged — see review notes."}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
