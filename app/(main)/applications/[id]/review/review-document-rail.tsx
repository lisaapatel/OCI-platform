"use client";

import clsx from "clsx";

import type { ReviewDocumentRow } from "./review-types";

export type DocumentRailStats = {
  total: number;
  filled: number;
  conflicts: number;
  manualFlags: number;
};

type Props = {
  documents: ReviewDocumentRow[];
  activeDocId: string;
  onSelect: (id: string) => void;
  statsByDocId: Map<string, DocumentRailStats>;
  tabLabel: (doc: ReviewDocumentRow) => string;
};

export function ReviewDocumentRail({
  documents,
  activeDocId,
  onSelect,
  statsByDocId,
  tabLabel,
}: Props) {
  return (
    <div
      className="no-print flex min-h-0 w-full flex-col rounded-lg border border-[#e2e8f0] bg-white shadow-sm lg:h-full lg:min-h-0 max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none"
      role="tablist"
      aria-label="Documents"
    >
      <p className="hidden border-b border-[#e2e8f0] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#64748b] lg:block">
        Documents
      </p>
      <div className="flex min-h-0 flex-row gap-2 overflow-x-auto overflow-y-hidden pb-1 pt-0.5 lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overflow-x-hidden lg:px-0.5 lg:py-1 lg:pb-1">
        {documents.map((d) => {
          const st = statsByDocId.get(d.id) ?? {
            total: 0,
            filled: 0,
            conflicts: 0,
            manualFlags: 0,
          };
          const selected = d.id === activeDocId;
          const secondary = d.file_name?.trim();
          const hasConflicts = st.conflicts > 0;
          const needsReview = st.manualFlags > 0;
          const noData = st.total === 0;
          const titleAttr = secondary
            ? `${tabLabel(d)} — ${secondary}`
            : tabLabel(d);
          const ariaStatus = [
            hasConflicts ? `Conflicts on ${st.conflicts} field(s)` : null,
            needsReview ? "Needs review" : null,
            noData ? "No extracted fields" : null,
            !hasConflicts && !needsReview && !noData ? "Ready" : null,
          ]
            .filter(Boolean)
            .join(". ");
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={titleAttr}
              aria-label={`${tabLabel(d)}. ${ariaStatus}.${selected ? " Selected." : ""}`}
              onClick={() => onSelect(d.id)}
              data-selected={selected ? "true" : "false"}
              data-has-conflicts={hasConflicts ? "true" : "false"}
              data-needs-review={needsReview && !hasConflicts ? "true" : "false"}
              data-no-extraction={noData ? "true" : "false"}
              className={clsx(
                "relative flex min-w-[9.5rem] shrink-0 flex-col items-start gap-1 rounded-md border-l-[3px] px-2 py-2 text-left transition-colors duration-150 lg:min-w-0 lg:w-full",
                selected &&
                  "border-l-[#2563eb] bg-blue-50 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.12)]",
                !selected &&
                  hasConflicts &&
                  "border-l-red-500 bg-red-50/50 hover:bg-red-50/80",
                !selected &&
                  !hasConflicts &&
                  needsReview &&
                  "border-l-amber-400 bg-amber-50/40 hover:bg-amber-50/60",
                !selected &&
                  !hasConflicts &&
                  !needsReview &&
                  noData &&
                  "border-l-slate-300 bg-slate-50/60 hover:bg-slate-50",
                !selected &&
                  !hasConflicts &&
                  !needsReview &&
                  !noData &&
                  "border-l-slate-200 hover:bg-slate-50"
              )}
            >
              {hasConflicts ? (
                <span
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-1 ring-white"
                  aria-hidden
                />
              ) : null}
              <span
                className={clsx(
                  "line-clamp-2 w-full pr-3 text-xs font-semibold leading-snug",
                  selected ? "text-[#1e40af]" : "text-[#1e293b]"
                )}
              >
                {tabLabel(d)}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {noData ? (
                  <span className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                    Empty
                  </span>
                ) : null}
                {hasConflicts ? (
                  <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-semibold text-red-900">
                    Conflicts
                  </span>
                ) : null}
                {needsReview ? (
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-950">
                    Review
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
