"use client";

import clsx from "clsx";

type Props = {
  /** Fields with auto-recon conflict + flagged */
  conflictFieldCount: number;
  /** Documents that have at least one conflict field */
  docsWithConflicts: number;
  /** Any flagged field (includes conflicts) */
  flaggedFieldCount: number;
  filledFieldCount: number;
  totalFieldCount: number;
};

/**
 * Compact orientation strip under the page title — all counts from client-side deduped fields.
 */
export function ReviewSummaryStrip({
  conflictFieldCount,
  docsWithConflicts,
  flaggedFieldCount,
  filledFieldCount,
  totalFieldCount,
}: Props) {
  const hasPriority =
    conflictFieldCount > 0 || flaggedFieldCount > 0;

  return (
    <div
      className="no-print mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 text-xs text-[#475569]"
      data-testid="review-summary-strip"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 font-semibold uppercase tracking-wide text-[#64748b]">
          Review focus
        </span>
        {conflictFieldCount > 0 ? (
          <span className="font-medium text-red-800">
            {conflictFieldCount} conflict{conflictFieldCount === 1 ? "" : "s"}
            {docsWithConflicts > 0
              ? ` · ${docsWithConflicts} doc${docsWithConflicts === 1 ? "" : "s"}`
              : ""}{" "}
            — check first
          </span>
        ) : flaggedFieldCount > 0 ? (
          <span className="font-medium text-amber-900">
            {flaggedFieldCount} flagged — review notes
          </span>
        ) : (
          <span className="text-[#64748b]">No conflicts or flags</span>
        )}
      </div>
      <span
        className={clsx(
          "hidden h-4 w-px shrink-0 bg-[#cbd5e1] sm:block",
          !hasPriority && "sm:hidden"
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
        <span>
          <span className="text-[#94a3b8]">Filled </span>
          <span className="font-semibold text-[#0f172a]">
            {filledFieldCount}/{totalFieldCount}
          </span>
          <span className="text-[#94a3b8]"> fields</span>
        </span>
        {flaggedFieldCount > 0 ? (
          <span>
            <span className="text-[#94a3b8]">Flagged </span>
            <span className="font-semibold text-[#0f172a]">
              {flaggedFieldCount}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
