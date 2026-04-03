"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

type Props = {
  rotationDeg: number;
  scale: number;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

function ToolBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[#e2e8f0] bg-white px-2 text-xs font-medium text-[#334155] shadow-sm transition-colors hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export function ReviewPreviewToolbar({
  rotationDeg,
  scale,
  onRotateLeft,
  onRotateRight,
  onZoomIn,
  onZoomOut,
  onReset,
}: Props) {
  return (
    <div
      className="no-print mb-2 flex flex-wrap items-center gap-1.5"
      data-testid="review-preview-toolbar"
    >
      <ToolBtn label="Rotate preview left" onClick={onRotateLeft}>
        ↺
      </ToolBtn>
      <ToolBtn label="Rotate preview right" onClick={onRotateRight}>
        ↻
      </ToolBtn>
      <span className="mx-1 hidden h-5 w-px bg-[#e2e8f0] sm:inline" aria-hidden />
      <ToolBtn label="Zoom out" onClick={onZoomOut}>
        −
      </ToolBtn>
      <span
        className={clsx(
          "min-w-[3rem] text-center text-[11px] font-medium tabular-nums text-[#64748b]"
        )}
      >
        {Math.round(scale * 100)}%
      </span>
      <ToolBtn label="Zoom in" onClick={onZoomIn}>
        +
      </ToolBtn>
      <ToolBtn label="Reset preview view" onClick={onReset}>
        Reset
      </ToolBtn>
      <span className="ml-auto text-[10px] text-[#94a3b8]">
        PDF: zoom/rotate apply to the whole preview frame
      </span>
    </div>
  );
}

export { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX };
