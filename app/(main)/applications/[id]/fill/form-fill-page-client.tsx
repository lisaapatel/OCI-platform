"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getChecklistForApplication,
  resolveDocTypeChecklistLabel,
} from "@/lib/application-checklist";
import {
  getValueByKeysAndSources,
  normalizeStoredFieldKey,
  OCI_FORM_FILL_BLOCKS,
} from "@/lib/form-fill-sections";
import {
  PORTAL_IMAGE_MAX_KB,
  PORTAL_PDF_MAX_KB,
} from "@/lib/portal-constants";
import { OCI_CHECKLIST_SUBMISSION_NOTE } from "@/lib/oci-new-checklist";
import {
  isPortalPdfChecklistItem,
  type PortalReadinessSnapshot,
} from "@/lib/portal-readiness";
import { ApplicationPdfDownloadsForFill } from "../application-pdf-downloads";
import { applicantIsMinorFromFields } from "@/lib/applicant-minor";
import {
  buildOciFormFillPlan,
  flattenOciFormFillRows,
  permanentAddressRowsAllEmpty,
  type GovtFillRowConfig,
} from "@/lib/oci-form-fill-build";
import type { Application, ExtractedField } from "@/lib/types";

const COPY_FLASH_MS = 1500;

const OCCUPATION_OPTIONS = ["BUSINESS", "SERVICE", "STUDENT", "OTHER"] as const;

const FILL_JUMP_SECTIONS_OCI: { id: string; label: string }[] = [
  { id: "fill-section-1-submission", label: "Submission" },
  { id: "fill-section-2-personal", label: "Personal" },
  { id: "fill-section-3-foreign_passport", label: "Passport" },
  { id: "fill-section-4-former_indian", label: "Former IN" },
  { id: "fill-section-5-present_address", label: "Present" },
  { id: "fill-section-6-permanent_address", label: "Permanent" },
  { id: "fill-section-7-family", label: "Family" },
];

function FillPortalPrerequisitesCollapsible({
  allPortalGreen,
  summaryLine,
  children,
}: {
  allPortalGreen: boolean;
  summaryLine: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!allPortalGreen);
  useEffect(() => {
    if (!allPortalGreen) setOpen(true);
  }, [allPortalGreen]);

  return (
    <details
      id="fill-prerequisites"
      className="group no-print scroll-mt-24 rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-150 hover:shadow-md [&_summary::-webkit-details-marker]:hidden"
      data-testid="form-fill-portal-prerequisites"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      suppressHydrationWarning
    >
      <summary className="cursor-pointer list-none rounded-xl px-4 py-3 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#1e3a5f]/20 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-slate-900">
              Govt portal prerequisites (live status)
            </span>
            <p className="mt-0.5 text-xs text-slate-600">{summaryLine}</p>
          </div>
          <ChevronDown
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1e3a5f] opacity-90 transition-transform duration-200 group-open:rotate-180 sm:mt-0"
            aria-hidden
            strokeWidth={2.5}
          />
        </div>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700 sm:px-5">
        {children}
      </div>
    </details>
  );
}

function pickFieldByKeys(
  fields: ExtractedField[],
  keys: string[]
): ExtractedField | undefined {
  const want = new Set(keys.map((k) => normalizeStoredFieldKey(k)));
  for (const f of fields) {
    if (want.has(normalizeStoredFieldKey(f.field_name))) return f;
  }
  return undefined;
}

function pickFromPassportOrFallback(
  fields: ExtractedField[],
  keys: string[],
  sourceDocType: string
): ExtractedField | undefined {
  const want = new Set(keys.map((k) => normalizeStoredFieldKey(k)));
  for (const f of fields) {
    if (
      f.source_doc_type === sourceDocType &&
      want.has(normalizeStoredFieldKey(f.field_name))
    ) {
      return f;
    }
  }
  return pickFieldByKeys(fields, keys);
}

function PassportFieldRow({
  label,
  field,
}: {
  label: string;
  field: ExtractedField | undefined;
}) {
  const v = (field?.field_value ?? "").trim();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-2 text-right">
        <span className="text-sm text-slate-900">{v || "—"}</span>
        {field ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {resolveDocTypeChecklistLabel(field.source_doc_type)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function maritalStatusFromFields(fields: ExtractedField[]): string {
  for (const f of fields) {
    const k = normalizeStoredFieldKey(f.field_name);
    if (k === "marital_status" || k === "marital") {
      return String(f.field_value ?? "").trim();
    }
  }
  return "";
}

function isMarriedForSpouseSection(raw: string): boolean {
  const t = raw.toLowerCase();
  if (!t) return false;
  if (/\bunmarried\b/i.test(t) || /\bsingle\b/i.test(t)) return false;
  return /\bmarried\b/i.test(t);
}

function fillRowHasValue(r: GovtFillRowConfig): boolean {
  if (r.rowKind === "reference_note") return true;
  if (r.mode === "input") return (r.inputValue ?? "").trim().length > 0;
  if (r.mode === "select") return (r.selectValue ?? "").trim().length > 0;
  return r.copyText.trim().length > 0;
}

function extractedFieldHasValue(field: ExtractedField | undefined): boolean {
  return (field?.field_value ?? "").trim().length > 0;
}

function FillHideEmptyToolbar({
  hideEmptyFields,
  onShowAll,
  onHideEmpty,
  filled,
  empty,
}: {
  hideEmptyFields: boolean;
  onShowAll: () => void;
  onHideEmpty: () => void;
  filled: number;
  empty: number;
}) {
  return (
    <div
      className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between"
      data-testid="form-fill-hide-empty-toolbar"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Field list
        </span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-1">
          <button
            type="button"
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-150 sm:px-4 sm:py-2",
              !hideEmptyFields
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
            onClick={onShowAll}
          >
            Show all fields
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-150 sm:px-4 sm:py-2",
              hideEmptyFields
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
            onClick={onHideEmpty}
          >
            Hide empty
          </button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">
        <span className="font-medium text-slate-700">{filled}</span> with values
        {empty > 0 ? (
          <>
            {" "}
            · <span className="font-medium text-slate-700">{empty}</span> empty
          </>
        ) : null}
        {!hideEmptyFields && empty > 0 ? (
          <span className="mt-1 block text-slate-500 sm:mt-0 sm:inline sm:before:content-['—_']">
            Use Hide empty to scan faster.
          </span>
        ) : null}
      </p>
    </div>
  );
}

function FillHeaderPrintAndDownloads({
  applicationId,
  appNumber,
  serviceType,
  ociFileReferenceNumber,
}: {
  applicationId: string;
  appNumber: string;
  serviceType: Application["service_type"];
  ociFileReferenceNumber?: string | null;
}) {
  const handlePrintClick = () => {
    window.print();
  };

  return (
    <div className="no-print flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-end">
        <ApplicationPdfDownloadsForFill
          applicationId={applicationId}
          appNumber={appNumber}
          serviceType={serviceType}
          ociFileReferenceNumber={ociFileReferenceNumber}
          className="no-print w-full min-w-0 sm:max-w-xs"
        />
        <button
          type="button"
          onClick={handlePrintClick}
          className="no-print inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
        >
          Print this page
        </button>
      </div>
    </div>
  );
}

function GovtPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col justify-center py-0.5 print:min-h-[72px] print:rounded-lg print:border print:border-slate-400 print:bg-slate-100 print:p-3 print:shadow-none">
      <span className="hidden text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500 print:inline sm:print:text-[10px]">
        Portal reference
      </span>
      <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 sm:text-sm print:mt-1 print:text-base print:font-medium print:normal-case print:tracking-normal print:text-black">
        {label}
      </span>
    </div>
  );
}


type GovtFillRowProps = GovtFillRowConfig & {
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
};

function FormFillReferenceNote({
  stableId,
  referenceText,
}: {
  stableId: string;
  referenceText: string;
}) {
  return (
    <div
      className="border-b border-slate-200/90 py-2 text-sm text-slate-500"
      data-field-id={stableId}
    >
      {referenceText}
    </div>
  );
}

function GovtFillRow({
  stableId,
  govtLabel,
  copyText,
  showNoAutoDataHint,
  flagMeta,
  copiedId,
  onCopy,
  mode,
  inputValue,
  onInputChange,
  onBlurPersist,
  inputPlaceholder,
  readOnly,
  sourceTag,
  selectValue,
  onSelectChange,
  selectPlaceholder,
}: GovtFillRowProps) {
  const trimmedCopy = copyText.trim();
  const isCopied = copiedId === stableId;

  const showCopy =
    trimmedCopy.length > 0 ||
    (mode === "input" && (inputValue ?? "").trim().length > 0) ||
    (mode === "select" && (selectValue ?? "").trim().length > 0);

  const handleCopy = () => {
    if (mode === "input") {
      const t = (inputValue ?? "").trim();
      if (t) void onCopy(t, stableId);
      return;
    }
    if (mode === "select") {
      const t = (selectValue ?? "").trim();
      if (t) void onCopy(t, stableId);
      return;
    }
    if (trimmedCopy) void onCopy(trimmedCopy, stableId);
  };

  return (
    <div
      className={clsx(
        "fill-govt-row grid grid-cols-[minmax(5.5rem,26%)_minmax(0,1fr)] items-center gap-2.5 border-b border-slate-100 py-2.5 sm:gap-4 sm:py-3 print:grid-cols-[38%_1fr] print:items-start print:gap-4 print:border-slate-200/90 print:py-4",
        showNoAutoDataHint && "border-l-2 border-l-amber-300 pl-3 print:border-l-0 print:pl-0"
      )}
      data-field-id={stableId}
    >
      <div className="min-w-0">
        <GovtPlaceholder label={govtLabel} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="hidden flex-wrap items-center gap-2 print:flex">
          <span className="text-xs font-semibold uppercase tracking-wide text-black">
            {govtLabel}
          </span>
          {sourceTag ? (
            <span
              className={clsx(
                "inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide print:text-black",
                sourceTag.variant === "blue" &&
                  "bg-blue-100 text-blue-900 print:border print:border-blue-300",
                sourceTag.variant === "grey" &&
                  "bg-slate-200/90 text-slate-700 print:border print:border-slate-400",
                sourceTag.variant === "orange" &&
                  "bg-orange-100 text-orange-950 print:border print:border-orange-300"
              )}
            >
              {sourceTag.label}
            </span>
          ) : null}
        </div>

        {mode === "input" ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
            <input
              type="text"
              className="min-w-0 w-full max-w-lg flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 shadow-sm sm:px-3 sm:py-2 sm:text-base print:border-slate-400 print:py-2 print:text-lg read-only:bg-slate-50 read-only:text-slate-600"
              value={inputValue ?? ""}
              readOnly={readOnly}
              onChange={(e) => onInputChange?.(e.target.value)}
              onBlur={(e) => void onBlurPersist?.(e.target.value)}
              placeholder={inputPlaceholder ?? ""}
              aria-label={govtLabel}
              data-empty={showNoAutoDataHint ? "true" : "false"}
            />
            {sourceTag ? (
              <span
                className={clsx(
                  "no-print inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  sourceTag.variant === "blue" && "bg-blue-50 text-blue-800",
                  sourceTag.variant === "grey" &&
                    "bg-slate-100 text-slate-600",
                  sourceTag.variant === "orange" &&
                    "bg-orange-50 text-orange-900"
                )}
              >
                {sourceTag.label}
              </span>
            ) : null}
            {showCopy ? (
              <button
                type="button"
                className="no-print shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100"
                onClick={handleCopy}
              >
                {isCopied ? "Copied!" : "Copy"}
              </button>
            ) : null}
          </div>
        ) : null}

        {mode === "select" ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
            <select
              className="no-print min-w-0 w-full max-w-md flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 shadow-sm sm:px-3 sm:py-2 sm:text-base print:hidden"
              value={selectValue ?? ""}
              onChange={(e) => onSelectChange?.(e.target.value)}
              onBlur={(e) => void onBlurPersist?.(e.target.value)}
              aria-label={govtLabel}
            >
              <option value="">{selectPlaceholder ?? "Select…"}</option>
              {OCCUPATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {(selectValue ?? "").trim() ? (
              <p className="hidden print:block text-lg font-medium text-black">
                {selectValue}
              </p>
            ) : null}
            {sourceTag ? (
              <span
                className={clsx(
                  "no-print inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  sourceTag.variant === "blue" && "bg-blue-50 text-blue-800",
                  sourceTag.variant === "grey" &&
                    "bg-slate-100 text-slate-600",
                  sourceTag.variant === "orange" &&
                    "bg-orange-50 text-orange-900"
                )}
              >
                {sourceTag.label}
              </span>
            ) : null}
            {showCopy ? (
              <button
                type="button"
                className="no-print shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100"
                onClick={handleCopy}
              >
                {isCopied ? "Copied!" : "Copy"}
              </button>
            ) : null}
          </div>
        ) : null}

        {showNoAutoDataHint ? (
          <p className="no-print text-[11px] font-medium leading-snug text-amber-900/90">
            No auto data — enter manually
          </p>
        ) : null}
        {showNoAutoDataHint ? (
          <p className="hidden text-xs text-slate-600 print:block">
            No auto data — enter manually
          </p>
        ) : null}

        {flagMeta.flagged ? (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-950 print:border-amber-600"
            role="alert"
          >
            <span className="font-semibold">Flagged (review):</span>{" "}
            {flagMeta.notes.length
              ? flagMeta.notes.join(" · ")
              : "See review notes."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FormFillPageClient({
  applicationId,
  appNumber,
  customerName,
  customerEmail,
  customerPhone,
  serviceType = "oci_new",
  isMinor = false,
  ociIntakeVariant = null,
  lastReviewedLabel,
  initialFields,
  portalReadiness,
  ociFileReferenceNumber = null,
}: {
  applicationId: string;
  appNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceType?: Application["service_type"];
  isMinor?: boolean;
  ociIntakeVariant?: Application["oci_intake_variant"];
  lastReviewedLabel: string;
  initialFields: ExtractedField[];
  portalReadiness: PortalReadinessSnapshot;
  /** Saved portal ref; required server-side to generate undertaking PDF. */
  ociFileReferenceNumber?: string | null;
}) {
  const [fields, setFields] = useState<ExtractedField[]>(initialFields);
  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  const [hideEmptyFields, setHideEmptyFields] = useState(false);
  const [printMode, setPrintMode] = useState(false);
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
  const effectiveHideEmpty = printMode ? false : hideEmptyFields;

  const uploadedDocSet = useMemo(
    () => new Set(portalReadiness.uploaded_doc_types ?? []),
    [portalReadiness.uploaded_doc_types]
  );

  const suggestedPortalUploadOrder = useMemo(
    () =>
      getChecklistForApplication({
        service_type: serviceType,
        is_minor: isMinor,
        oci_intake_variant: ociIntakeVariant ?? null,
      }),
    [serviceType, isMinor, ociIntakeVariant]
  );

  const hasFormerIndianExtracted = useMemo(() => {
    const block = OCI_FORM_FILL_BLOCKS.find((b) => b.id === "former_indian");
    if (!block) return false;
    return block.fields.some((def) => {
      const src = def.sourceDocTypes ?? [];
      if (!src.length) return false;
      return getValueByKeysAndSources(fields, def.keys, src).trim() !== "";
    });
  }, [fields]);

  useEffect(() => {
    setFormerIndianOpen(hasFormerIndianExtracted);
  }, [hasFormerIndianExtracted]);

  const detectionBanner = useMemo(() => {
    const foreignCountry =
      getValueByKeysAndSources(
        fields,
        ["passport_issue_country", "country_of_issue", "issuing_country"],
        ["current_passport"]
      ).trim() ||
      getValueByKeysAndSources(
        fields,
        ["current_nationality", "nationality", "citizenship"],
        ["current_passport"]
      ).trim() ||
      "Unknown";

    const formerUpload =
      uploadedDocSet.has("former_indian_passport") ||
      uploadedDocSet.has("old_passport");
    const formerLabel =
      formerUpload || hasFormerIndianExtracted ? "Found" : "Not found";

    const hasPp =
      uploadedDocSet.has("parent_passport") ||
      uploadedDocSet.has("parent_indian_doc");
    const hasPo = uploadedDocSet.has("parent_oci");
    let parentLabel = "Not uploaded";
    if (hasPp && hasPo) parentLabel = "Indian Passport + OCI Card";
    else if (hasPp) parentLabel = "Indian Passport";
    else if (hasPo) parentLabel = "OCI Card";

    return { foreignCountry, formerLabel, parentLabel };
  }, [fields, uploadedDocSet, hasFormerIndianExtracted]);

  const portalPrerequisitesSummaryLine = useMemo(
    () =>
      portalReadiness.all_portal_green
        ? "All checks passed — expand for upload order and application link"
        : "Some portal checks need attention — expand for details",
    [portalReadiness.all_portal_green]
  );

  const [localEmail, setLocalEmail] = useState(() =>
    (customerEmail ?? "").trim()
  );
  const [localPhone, setLocalPhone] = useState(() =>
    (customerPhone ?? "").trim()
  );
  const [formerIndianOpen, setFormerIndianOpen] = useState(false);
  const [permanentSameAsPresent, setPermanentSameAsPresent] = useState(() =>
    permanentAddressRowsAllEmpty(
      initialFields,
      applicantIsMinorFromFields(initialFields, new Date())
    )
  );

  useEffect(() => {
    setLocalEmail((customerEmail ?? "").trim());
    setLocalPhone((customerPhone ?? "").trim());
  }, [customerEmail, customerPhone]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedId) return;
    const t = window.setTimeout(() => setCopiedId(null), COPY_FLASH_MS);
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

  const persistExtractedField = useCallback(
    async (fieldId: string, value: string) => {
      const res = await fetch(`/api/fields/${fieldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field_value: value,
          is_flagged: false,
          flag_note: "",
        }),
      });
      if (!res.ok) return;
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId
            ? {
                ...f,
                field_value: value,
                is_flagged: false,
                flag_note: "",
              }
            : f
        )
      );
    },
    [applicationId]
  );

  const applicantIsMinor = useMemo(
    () => isMinor || applicantIsMinorFromFields(fields, new Date()),
    [fields, isMinor]
  );

  const married = applicantIsMinor
    ? false
    : isMarriedForSpouseSection(maritalStatusFromFields(fields));

  const sectionPlan = useMemo(
    () =>
      buildOciFormFillPlan({
        fields,
        setFields,
        persistExtractedField,
        localPhone,
        setLocalPhone,
        localEmail,
        setLocalEmail,
        uploadedDocSet,
        married,
        formerIndianOpen,
        setFormerIndianOpen,
        permanentSameAsPresent,
        setPermanentSameAsPresent,
        hasFormerIndianExtracted,
        applicantIsMinor,
      }),
    [
      fields,
      persistExtractedField,
      localPhone,
      localEmail,
      uploadedDocSet,
      married,
      formerIndianOpen,
      permanentSameAsPresent,
      hasFormerIndianExtracted,
      applicantIsMinor,
    ]
  );

  const rowPropsList = useMemo(
    () => flattenOciFormFillRows(sectionPlan),
    [sectionPlan]
  );

  const progressRows = useMemo(
    () => rowPropsList.filter((r) => r.rowKind !== "reference_note"),
    [rowPropsList]
  );

  const visibleFieldCount = progressRows.length;

  const { filled, manual } = useMemo(() => {
    let f = 0;
    let m = 0;
    for (const r of progressRows) {
      let has = false;
      if (r.mode === "input") has = (r.inputValue ?? "").trim().length > 0;
      else if (r.mode === "select")
        has = (r.selectValue ?? "").trim().length > 0;
      else has = r.copyText.trim().length > 0;
      if (has) f += 1;
      else m += 1;
    }
    return { filled: f, manual: m };
  }, [progressRows]);

  const renderRow = (r: GovtFillRowConfig) =>
    r.rowKind === "reference_note" && r.referenceText ? (
      <FormFillReferenceNote
        key={r.stableId}
        stableId={r.stableId}
        referenceText={r.referenceText}
      />
    ) : (
      <GovtFillRow
        key={r.stableId}
        {...r}
        copiedId={copiedId}
        onCopy={copyValue}
      />
    );

  if (serviceType === "passport_renewal") {
    const addressFields = fields.filter(
      (f) =>
        f.source_doc_type === "us_address_proof" ||
        f.source_doc_type === "indian_address_proof"
    );

    const renewalApplicantSpecs = [
      {
        label: "First name",
        field: pickFromPassportOrFallback(
          fields,
          ["first_name", "given_name", "firstname"],
          "current_passport"
        ),
      },
      {
        label: "Last name",
        field: pickFromPassportOrFallback(
          fields,
          ["last_name", "surname", "family_name"],
          "current_passport"
        ),
      },
      {
        label: "Date of birth",
        field: pickFromPassportOrFallback(
          fields,
          ["date_of_birth", "dob", "birth_date"],
          "current_passport"
        ),
      },
      {
        label: "Place of birth",
        field: pickFromPassportOrFallback(
          fields,
          ["place_of_birth", "birth_place", "pob"],
          "current_passport"
        ),
      },
      {
        label: "Gender",
        field: pickFromPassportOrFallback(
          fields,
          ["gender", "sex"],
          "current_passport"
        ),
      },
    ];
    const renewalPassportSpecs = [
      {
        label: "Passport number",
        field: pickFromPassportOrFallback(
          fields,
          ["passport_number", "passport_no", "passport_num"],
          "current_passport"
        ),
      },
      {
        label: "Issue date",
        field: pickFromPassportOrFallback(
          fields,
          ["issue_date", "date_of_issue", "passport_issue_date"],
          "current_passport"
        ),
      },
      {
        label: "Expiry date",
        field: pickFromPassportOrFallback(
          fields,
          ["expiry_date", "date_of_expiry", "passport_expiry_date"],
          "current_passport"
        ),
      },
      {
        label: "Issue place",
        field: pickFromPassportOrFallback(
          fields,
          ["issue_place", "place_of_issue", "issuing_office"],
          "current_passport"
        ),
      },
    ];
    const renewalAddressSpecs = addressFields.map((f) => ({
      label: normalizeStoredFieldKey(f.field_name),
      field: f,
    }));
    const renewalAllSpecs = [
      ...renewalApplicantSpecs,
      ...renewalPassportSpecs,
      ...renewalAddressSpecs,
    ];
    let renewalFilled = 0;
    for (const row of renewalAllSpecs) {
      if (extractedFieldHasValue(row.field)) renewalFilled += 1;
    }
    const renewalTotal = renewalAllSpecs.length;
    const renewalEmpty = renewalTotal - renewalFilled;

    return (
      <div className="fill-print-root mx-auto flex min-h-screen max-w-5xl flex-col gap-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
        <header className="no-print rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                href={`/applications/${applicationId}/review`}
                className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
              >
                Back to Review
              </Link>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                <span>{appNumber}</span>
                <span className="mx-2 font-normal text-slate-500">·</span>
                <span>{customerName}</span>
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Indian passport renewal — extracted values only (no cross-doc
                reconciliation).
              </p>
            </div>
            <FillHeaderPrintAndDownloads
              applicationId={applicationId}
              appNumber={appNumber}
              serviceType={serviceType}
              ociFileReferenceNumber={ociFileReferenceNumber}
            />
          </div>
        </header>

        <nav
          aria-label="Jump to form sections"
          className="no-print sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-50/95 px-2 py-2 text-xs shadow-sm backdrop-blur-sm sm:gap-2 sm:px-3"
        >
          <span className="hidden px-1 font-semibold text-slate-500 sm:inline">
            Jump:
          </span>
          <a
            href="#fill-renewal-about"
            className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
          >
            About
          </a>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <a
            href="#fill-renewal-s1-applicant"
            className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
          >
            Applicant
          </a>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <a
            href="#fill-renewal-s2-passport"
            className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
          >
            Passport
          </a>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <a
            href="#fill-renewal-s3-address"
            className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
          >
            Address
          </a>
        </nav>

        <div
          id="fill-renewal-about"
          className="no-print scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          Fields below come from AI extraction. Source tags show which uploaded
          document each value came from.
          {lastReviewedLabel !== "—" ? (
            <span className="mt-2 block text-slate-600">
              Last reviewed: {lastReviewedLabel}
            </span>
          ) : null}
        </div>

        <div
          className="no-print scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 text-sm"
          data-testid="form-fill-renewal-summary"
        >
          <p
            className="text-base font-semibold text-slate-900"
            data-testid="form-fill-renewal-progress"
          >
            {renewalFilled} of {renewalTotal} fields have values
          </p>
          <FillHideEmptyToolbar
            hideEmptyFields={hideEmptyFields}
            onShowAll={() => setHideEmptyFields(false)}
            onHideEmpty={() => setHideEmptyFields(true)}
            filled={renewalFilled}
            empty={renewalEmpty}
          />
        </div>

        <section
          id="fill-renewal-s1-applicant"
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <h2 className="mb-4 border-b border-slate-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            Section 1 — Applicant details
          </h2>
          {effectiveHideEmpty &&
          renewalApplicantSpecs.every((s) => !extractedFieldHasValue(s.field)) ? (
            <p className="text-sm text-slate-600">
              All fields empty in this section.{" "}
              <button
                type="button"
                className="font-medium text-blue-700 underline-offset-2 hover:underline"
                onClick={() => setHideEmptyFields(false)}
              >
                Show all fields
              </button>
            </p>
          ) : (
            renewalApplicantSpecs
              .filter(
                (s) =>
                  !effectiveHideEmpty || extractedFieldHasValue(s.field)
              )
              .map((s) => (
                <PassportFieldRow
                  key={s.label}
                  label={s.label}
                  field={s.field}
                />
              ))
          )}
        </section>

        <section
          id="fill-renewal-s2-passport"
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <h2 className="mb-4 border-b border-slate-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            Section 2 — Current passport
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Typically extracted from the current Indian passport upload.
          </p>
          {effectiveHideEmpty &&
          renewalPassportSpecs.every((s) => !extractedFieldHasValue(s.field)) ? (
            <p className="text-sm text-slate-600">
              All fields empty in this section.{" "}
              <button
                type="button"
                className="font-medium text-blue-700 underline-offset-2 hover:underline"
                onClick={() => setHideEmptyFields(false)}
              >
                Show all fields
              </button>
            </p>
          ) : (
            renewalPassportSpecs
              .filter(
                (s) =>
                  !effectiveHideEmpty || extractedFieldHasValue(s.field)
              )
              .map((s) => (
                <PassportFieldRow
                  key={s.label}
                  label={s.label}
                  field={s.field}
                />
              ))
          )}
        </section>

        <section
          id="fill-renewal-s3-address"
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <h2 className="mb-4 border-b border-slate-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            Section 3 — Address
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            From US or Indian address proof uploads, when provided.
          </p>
          {addressFields.length === 0 ? (
            <p className="text-sm text-slate-600">
              No address fields extracted yet from address proof documents.
            </p>
          ) : effectiveHideEmpty &&
            renewalAddressSpecs.every((s) => !extractedFieldHasValue(s.field)) ? (
            <p className="text-sm text-slate-600">
              All fields empty in this section.{" "}
              <button
                type="button"
                className="font-medium text-blue-700 underline-offset-2 hover:underline"
                onClick={() => setHideEmptyFields(false)}
              >
                Show all fields
              </button>
            </p>
          ) : (
            <div>
              {renewalAddressSpecs
                .filter(
                  (s) =>
                    !effectiveHideEmpty ||
                    extractedFieldHasValue(s.field)
                )
                .map((s) => (
                  <PassportFieldRow
                    key={s.field.id}
                    label={s.label}
                    field={s.field}
                  />
                ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="fill-print-root mx-auto flex min-h-screen max-w-5xl flex-col gap-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <header className="no-print rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={`/applications/${applicationId}/review`}
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              Back to Review
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <span>{appNumber}</span>
              <span className="mx-2 font-normal text-slate-500">·</span>
              <span>{customerName}</span>
            </h1>
            <p
              className="mt-2 text-sm leading-relaxed text-slate-600"
              data-testid="form-fill-detection-banner"
            >
              <span className="font-medium text-slate-800">Detected profile:</span>{" "}
              {detectionBanner.foreignCountry}. Former Indian passport:{" "}
              <span className="font-medium text-slate-800">
                {detectionBanner.formerLabel}
              </span>
              . Parent document:{" "}
              <span className="font-medium text-slate-800">
                {detectionBanner.parentLabel}
              </span>
              .
            </p>
          </div>
          <FillHeaderPrintAndDownloads
            applicationId={applicationId}
            appNumber={appNumber}
            serviceType={serviceType}
            ociFileReferenceNumber={ociFileReferenceNumber}
          />
        </div>
      </header>

      <nav
        aria-label="Jump to form sections"
        className="no-print sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-50/95 px-2 py-2 text-xs shadow-sm backdrop-blur-sm sm:gap-2 sm:px-3"
      >
        <span className="hidden px-1 font-semibold text-slate-500 sm:inline">
          Jump:
        </span>
        <a
          href="#fill-prerequisites"
          className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
        >
          Portal prep
        </a>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <a
          href="#fill-progress"
          className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
        >
          Status
        </a>
        {FILL_JUMP_SECTIONS_OCI.map((s) => (
          <span key={s.id} className="contents">
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <a
              href={`#${s.id}`}
              className="rounded-md px-2 py-1 font-medium text-[#1e3a5f] transition-colors hover:bg-white hover:text-[#152a45]"
            >
              {s.label}
            </a>
          </span>
        ))}
      </nav>

      <FillPortalPrerequisitesCollapsible
        allPortalGreen={portalReadiness.all_portal_green}
        summaryLine={portalPrerequisitesSummaryLine}
      >
            <p className="text-xs text-slate-600">
              Have applicant photo &amp; signature JPEGs ready (max{" "}
              {PORTAL_IMAGE_MAX_KB}
              KB each). Photo: square {`200×200–1500×1500px`}. Signature: wide
              strip (~3× width vs height), {`200×67–1500×500px`}. Supporting
              documents: PDF, max {PORTAL_PDF_MAX_KB}KB each. All required
              checklist items must be uploaded on the official portal.
            </p>
            <p className="text-xs font-medium text-amber-900">
              NOTE: UPLOADING OF DOCUMENTS IS A MUST. YOUR APPLICATION WILL BE
              REJECTED AND RETURNED UNPROCESSED, IF YOU DON&apos;T UPLOAD ALL THE
              REQUIRED DOCUMENTS ON GOVT. PORTAL.
            </p>
            <p className="text-xs text-slate-700">{OCI_CHECKLIST_SUBMISSION_NOTE}</p>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <li>
                <span className="font-medium text-slate-800">
                  Parent doc for submission:{" "}
                </span>
                {portalReadiness.oci_parent_doc_for_submission ? (
                  <span className="text-green-700">Uploaded</span>
                ) : (
                  <span className="text-amber-800">
                    Upload parent passport or OCI
                  </span>
                )}
              </li>
              <li>
                <span className="font-medium text-slate-800">Required docs: </span>
                {portalReadiness.required_docs_complete ? (
                  <span className="text-green-700">Complete</span>
                ) : (
                  <span className="text-amber-800">Incomplete</span>
                )}
              </li>
              <li>
                <span className="font-medium text-slate-800">PDFs (portal): </span>
                {portalReadiness.checklist_pdfs_ready ? (
                  <span className="text-green-700">All within limit</span>
                ) : (
                  <span className="text-amber-800">
                    {portalReadiness.checklist_pdfs_uploaded > 0
                      ? "Compress or fix on application page"
                      : "Upload on application page"}
                  </span>
                )}
              </li>
              <li>
                <span className="font-medium text-slate-800">Applicant photo: </span>
                {portalReadiness.applicant_photo_valid == null ? (
                  <span className="text-slate-500">No file</span>
                ) : portalReadiness.applicant_photo_valid ? (
                  <span className="text-green-700">Valid</span>
                ) : (
                  <span className="text-amber-800">Fix on application page</span>
                )}
              </li>
              <li>
                <span className="font-medium text-slate-800">Signature: </span>
                {portalReadiness.applicant_signature_valid == null ? (
                  <span className="text-slate-500">Not uploaded (optional)</span>
                ) : portalReadiness.applicant_signature_valid ? (
                  <span className="text-green-700">Valid</span>
                ) : (
                  <span className="text-amber-800">Fix on application page</span>
                )}
              </li>
            </ul>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Suggested portal upload order
              </h4>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700">
                {suggestedPortalUploadOrder.map((item) => (
                  <li key={item.doc_type}>
                    {item.label}
                    {item.required ? (
                      <span className="text-red-600"> (required)</span>
                    ) : (
                      <span className="text-slate-500"> (optional)</span>
                    )}
                    <span className="text-slate-500">
                      {" "}
                      ·{" "}
                      {isPortalPdfChecklistItem(item)
                        ? `PDF ≤${PORTAL_PDF_MAX_KB}KB`
                        : `JPEG ≤${PORTAL_IMAGE_MAX_KB}KB`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <Link
              href={`/applications/${applicationId}`}
              className="inline-flex text-sm font-semibold text-blue-700 hover:underline"
            >
              Open application → Govt portal readiness
            </Link>
      </FillPortalPrerequisitesCollapsible>

      <div
        id="fill-progress"
        className="no-print scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 text-sm"
        data-testid="form-fill-summary"
      >
        <p
          className="text-base font-semibold text-slate-900"
          data-testid="form-fill-progress"
        >
          {filled} of {visibleFieldCount} fields have values
        </p>
        {lastReviewedLabel !== "—" ? (
          <p className="mt-1 text-slate-600">
            Last reviewed: {lastReviewedLabel}
          </p>
        ) : null}
        {manual > 0 ? (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
            data-testid="form-fill-manual-banner"
          >
            {manual} field{manual === 1 ? "" : "s"} need manual entry
          </p>
        ) : null}
        <FillHideEmptyToolbar
          hideEmptyFields={hideEmptyFields}
          onShowAll={() => setHideEmptyFields(false)}
          onHideEmpty={() => setHideEmptyFields(true)}
          filled={filled}
          empty={manual}
        />
      </div>

      <div className="hidden print:block print:mb-4 print:border-b print:border-black/20 print:pb-3">
        <p className="text-[11pt] font-semibold text-black">
          {appNumber} · {customerName}
        </p>
        <p className="mt-1 text-[9pt] text-black/70">
          {filled} of {visibleFieldCount} fields have values
          {lastReviewedLabel !== "—"
            ? ` · Last reviewed ${lastReviewedLabel}`
            : ""}
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <section
          id="fill-section-1-submission"
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 print:shadow-none"
        >
          <h2 className="fill-print-section-title mb-4 border-b border-blue-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            SECTION 1 — Place of Submission
          </h2>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-950">
            <p className="font-semibold">Reminder</p>
            <p className="mt-1">
              Select based on customer&apos;s US state / consular jurisdiction.
            </p>
            <p className="mt-2 text-amber-900/90">
              No extracted value for this step — use consulate guidance and the
              customer&apos;s jurisdiction.
            </p>
          </div>
        </section>

        {sectionPlan.map((sec, planIdx) => {
          const sectionNum = planIdx + 2;
          const showFormerRows =
            sec.blockId !== "former_indian" ||
            formerIndianOpen ||
            hasFormerIndianExtracted;

          const rowsToShow = effectiveHideEmpty
            ? sec.rows.filter((r) => fillRowHasValue(r))
            : sec.rows;
          const emptyHiddenCount = sec.rows.length - rowsToShow.length;

          return (
            <section
              key={sec.blockId}
              id={`fill-section-${sectionNum}-${sec.blockId}`}
              className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 print:shadow-none"
            >
              <div className="mb-4 border-b border-blue-200 pb-2">
                {sec.collapsible ? (
                  <button
                    type="button"
                    onClick={sec.onFormerToggle}
                    className="fill-print-section-title flex w-full items-center gap-2 text-left text-lg font-bold text-[#1e3a5f]"
                  >
                    <ChevronDown
                      className={clsx(
                        "h-5 w-5 shrink-0 text-[#1e3a5f] transition-transform duration-200",
                        sec.formerOpen && "rotate-180"
                      )}
                      aria-hidden
                      strokeWidth={2.5}
                    />
                    <span>
                      SECTION {sectionNum} — {sec.title}
                    </span>
                  </button>
                ) : (
                  <h2 className="fill-print-section-title text-lg font-bold text-[#1e3a5f]">
                    SECTION {sectionNum} — {sec.title}
                  </h2>
                )}
                {sec.subtitle ? (
                  <p className="mt-2 text-xs text-slate-500">{sec.subtitle}</p>
                ) : null}
                {sec.permanentToggle ? (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={permanentSameAsPresent}
                      onChange={(e) =>
                        setPermanentSameAsPresent(e.target.checked)
                      }
                    />
                    Same as present address
                  </label>
                ) : null}
              </div>

              {sec.blockId === "former_indian" &&
              sec.showFormerEmptyHint &&
              !hasFormerIndianExtracted &&
              !formerIndianOpen ? (
                <p className="mb-3 text-sm text-slate-600">
                  ℹ No former Indian passport found. Skip if applicant never
                  held Indian citizenship.
                </p>
              ) : null}

              {sec.parentUploadNote ? (
                <p className="mb-3 text-sm text-amber-900">
                  Upload parent&apos;s Indian passport or OCI card to populate
                  these fields.
                </p>
              ) : null}

              {showFormerRows ? (
                rowsToShow.length === 0 && sec.rows.length > 0 ? (
                  <p className="text-sm text-slate-600">
                    All fields empty in this section.{" "}
                    <button
                      type="button"
                      className="font-medium text-blue-700 underline-offset-2 hover:underline"
                      onClick={() => setHideEmptyFields(false)}
                    >
                      Show all fields
                    </button>
                  </p>
                ) : (
                  <>
                    {effectiveHideEmpty &&
                    emptyHiddenCount > 0 &&
                    rowsToShow.length > 0 ? (
                      <p className="mb-2 text-xs text-slate-500">
                        {emptyHiddenCount} empty hidden —{" "}
                        <button
                          type="button"
                          className="font-medium text-blue-700 hover:underline"
                          onClick={() => setHideEmptyFields(false)}
                        >
                          Show all fields
                        </button>
                      </p>
                    ) : null}
                    <div className="divide-y divide-slate-100">
                      {rowsToShow.map(renderRow)}
                    </div>
                  </>
                )
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
