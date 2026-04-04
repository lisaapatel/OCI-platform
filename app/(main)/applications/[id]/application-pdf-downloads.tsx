"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import { isOciServiceType } from "@/lib/oci-intake-variant";
import type { Application } from "@/lib/types";

export type PortalPdfRow = {
  id: string;
  title: string;
  description?: string;
  enabled: boolean;
  href?: string;
  downloadFilename?: string;
  disabledHint?: string;
};

type AppLike = {
  id: string;
  app_number: string;
  service_type: Application["service_type"];
  oci_file_reference_number?: string | null;
};

/** Build rows for the portal PDF list (undertaking + reserved slots for future endpoints). */
export function buildPortalPdfRows(app: AppLike): PortalPdfRow[] {
  const rows: PortalPdfRow[] = [];
  const savedOciRef = (app.oci_file_reference_number ?? "").trim();
  const oci = isOciServiceType(app.service_type);

  if (oci) {
    const canUndertaking = savedOciRef !== "";
    rows.push({
      id: "undertaking-oci",
      title: "Undertaking by OCI applicant",
      description: "Government portal undertaking form (prefilled).",
      enabled: canUndertaking,
      href: canUndertaking
        ? `/api/applications/${encodeURIComponent(app.id)}/pdfs/undertaking-oci-applicant`
        : undefined,
      downloadFilename: canUndertaking
        ? `undertaking_oci_applicant_${app.app_number || app.id}.pdf`
        : undefined,
      disabledHint:
        "Save the OCI file reference # in Billing & tracking on this application first.",
    });
    rows.push({
      id: "placeholder-1",
      title: "Portal PDF (slot 2)",
      description: "Reserved — add endpoint when ready.",
      enabled: false,
      disabledHint: "Coming soon.",
    });
    rows.push({
      id: "placeholder-2",
      title: "Portal PDF (slot 3)",
      description: "Reserved — add endpoint when ready.",
      enabled: false,
      disabledHint: "Coming soon.",
    });
  }

  return rows;
}

type SectionProps = {
  rows: PortalPdfRow[];
  variant?: "sidebar" | "compact";
  className?: string;
};

/**
 * Collapsible list of portal PDF downloads. Default closed to save vertical space
 * when more PDFs are added.
 */
export function ApplicationPdfDownloadsSection({
  rows,
  variant = "sidebar",
  className,
}: SectionProps) {
  if (rows.length === 0) return null;

  const isCompact = variant === "compact";
  const summaryCls = clsx(
    "flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left font-semibold outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#1e3a5f]/25",
    isCompact ? "text-sm text-slate-800" : "text-sm text-slate-900",
  );
  const boxCls = clsx(
    "group rounded-lg border border-slate-200 bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden",
    isCompact ? "min-w-0 max-w-full" : "w-full",
    className,
  );
  const rowTitleCls = isCompact ? "text-sm font-medium" : "text-sm font-medium";
  const descCls = "mt-0.5 text-xs leading-snug text-slate-500";

  return (
    <details className={boxCls}>
      <summary className={summaryCls}>
        <span>Portal PDFs</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-[#1e3a5f] opacity-90 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
          strokeWidth={2.5}
        />
      </summary>
      <ul className="space-y-3 border-t border-slate-100 px-3 py-3">
        {rows.map((row) => (
          <li key={row.id}>
            {row.enabled && row.href ? (
              <a
                href={row.href}
                download={row.downloadFilename}
                className="block rounded-md text-[#1e3a5f] underline decoration-[#1e3a5f]/40 underline-offset-2 transition-colors hover:bg-slate-50 hover:decoration-[#1e3a5f]"
              >
                <span className={rowTitleCls}>{row.title}</span>
                {row.description ? (
                  <span className={clsx(descCls, "block")}>{row.description}</span>
                ) : null}
              </a>
            ) : (
              <div
                className="rounded-md text-slate-400"
                title={row.disabledHint}
              >
                <span className={rowTitleCls}>{row.title}</span>
                {row.description ? (
                  <span className={clsx(descCls, "block")}>{row.description}</span>
                ) : null}
                {row.disabledHint ? (
                  <span className="mt-1 block text-xs text-slate-400">
                    {row.disabledHint}
                  </span>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Sidebar + application detail: full `Application`. */
export function ApplicationPdfDownloadsForApplication({
  application,
  className,
}: {
  application: Application;
  className?: string;
}) {
  const rows = buildPortalPdfRows(application);
  return (
    <ApplicationPdfDownloadsSection
      rows={rows}
      variant="sidebar"
      className={className}
    />
  );
}

/** Form fill header: same PDF list with compact styling. */
export function ApplicationPdfDownloadsForFill({
  applicationId,
  appNumber,
  serviceType,
  ociFileReferenceNumber,
  className,
}: {
  applicationId: string;
  appNumber: string;
  serviceType: Application["service_type"];
  ociFileReferenceNumber?: string | null;
  className?: string;
}) {
  const rows = buildPortalPdfRows({
    id: applicationId,
    app_number: appNumber,
    service_type: serviceType,
    oci_file_reference_number: ociFileReferenceNumber,
  });
  if (rows.length === 0) return null;
  return (
    <ApplicationPdfDownloadsSection
      rows={rows}
      variant="compact"
      className={className}
    />
  );
}

/** Short helper text for billing section (PDFs live in hero Portal PDFs). */
export function BillingPortalPdfHint() {
  return (
    <p className="mt-3 text-xs leading-snug text-[#64748b]">
      Download generated portal forms from{" "}
      <strong className="font-medium text-[#475569]">Portal PDFs</strong> in the
      header above (after you save the OCI file reference #).
    </p>
  );
}
