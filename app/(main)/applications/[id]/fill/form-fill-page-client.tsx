"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getValueByKeysAndSources,
  normalizeStoredFieldKey,
  OCI_FORM_FILL_BLOCKS,
} from "@/lib/form-fill-sections";
import {
  PORTAL_IMAGE_MAX_KB,
  PORTAL_PDF_MAX_KB,
} from "@/lib/portal-constants";
import {
  OCI_CHECKLIST_SUBMISSION_NOTE,
  OCI_NEW_CHECKLIST,
} from "@/lib/oci-new-checklist";
import {
  isPortalPdfChecklistItem,
  type PortalReadinessSnapshot,
} from "@/lib/portal-readiness";
import { applicantIsMinorFromFields } from "@/lib/applicant-minor";
import {
  buildOciFormFillPlan,
  flattenOciFormFillRows,
  type GovtFillRowConfig,
} from "@/lib/oci-form-fill-build";
import type { ExtractedField } from "@/lib/types";

const COPY_FLASH_MS = 1500;

const OCCUPATION_OPTIONS = ["BUSINESS", "SERVICE", "STUDENT", "OTHER"] as const;

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

function GovtPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[72px] flex-col justify-center rounded-lg border border-slate-300/80 bg-slate-200/70 p-3 print:border-slate-400 print:bg-slate-100">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 print:text-slate-600">
        Portal reference
      </span>
      <span className="mt-1 text-sm font-medium leading-snug text-slate-700 print:text-black">
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
      className="fill-govt-row grid grid-cols-1 gap-3 border-b border-slate-200/90 py-4 sm:grid-cols-[40%_60%] sm:gap-4 print:grid-cols-[40%_60%]"
      data-field-id={stableId}
    >
      <div className="min-w-0">
        <GovtPlaceholder label={govtLabel} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 print:text-black">
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
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="min-w-[200px] flex-1 max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-medium text-slate-900 print:border-slate-400 read-only:bg-slate-50 read-only:text-slate-600"
              value={inputValue ?? ""}
              readOnly={readOnly}
              onChange={(e) => onInputChange?.(e.target.value)}
              onBlur={(e) => void onBlurPersist?.(e.target.value)}
              placeholder={inputPlaceholder ?? ""}
              aria-label={govtLabel}
              data-empty={showNoAutoDataHint ? "true" : "false"}
            />
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
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="no-print min-w-[200px] max-w-md flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-medium text-slate-900 print:hidden"
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
          <p className="text-xs text-slate-500 print:text-slate-600">
            No auto data — enter manually
          </p>
        ) : null}

        {flagMeta.flagged ? (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:border-amber-600"
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
  lastReviewedLabel,
  initialFields,
  portalReadiness,
}: {
  applicationId: string;
  appNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  lastReviewedLabel: string;
  initialFields: ExtractedField[];
  portalReadiness: PortalReadinessSnapshot;
}) {
  const [fields, setFields] = useState<ExtractedField[]>(initialFields);
  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  const uploadedDocSet = useMemo(
    () => new Set(portalReadiness.uploaded_doc_types ?? []),
    [portalReadiness.uploaded_doc_types]
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

  const [localEmail, setLocalEmail] = useState(() =>
    (customerEmail ?? "").trim()
  );
  const [localPhone, setLocalPhone] = useState(() =>
    (customerPhone ?? "").trim()
  );
  const [formerIndianOpen, setFormerIndianOpen] = useState(false);
  const [permanentSameAsPresent, setPermanentSameAsPresent] = useState(false);

  useEffect(() => {
    setLocalEmail((customerEmail ?? "").trim());
    setLocalPhone((customerPhone ?? "").trim());
  }, [customerEmail, customerPhone]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [portalPrepOpen, setPortalPrepOpen] = useState(false);

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
      const rec = await fetch("/api/reconcile/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId }),
      });
      const j = (await rec.json()) as { fields?: ExtractedField[] };
      if (rec.ok && Array.isArray(j.fields)) setFields(j.fields);
    },
    [applicationId]
  );

  const married = isMarriedForSpouseSection(maritalStatusFromFields(fields));

  const applicantIsMinor = useMemo(
    () => applicantIsMinorFromFields(fields, new Date()),
    [fields]
  );

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
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
          >
            Print this page
          </button>
        </div>
      </header>

      <div
        className="no-print rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 shadow-sm"
        data-testid="form-fill-detection-banner"
      >
        <p>
          <span className="font-semibold">📋 Detected profile:</span>{" "}
          {detectionBanner.foreignCountry}. Former Indian passport:{" "}
          <span className="font-medium">{detectionBanner.formerLabel}</span>.
          Parent document:{" "}
          <span className="font-medium">{detectionBanner.parentLabel}</span>.
        </p>
      </div>

      <div
        className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 shadow-sm print:border-blue-300"
        data-testid="form-fill-important-notes"
      >
        <p className="font-bold text-blue-900">Important notes</p>
        <p className="mt-2 font-medium">Before starting the govt portal:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Go to{" "}
            <span className="font-mono text-blue-900">ociservices.gov.in</span>{" "}
            → Click the correct application type
          </li>
          <li>Answer the CAPTCHA question</li>
          <li>
            Note down the Temporary Application ID — save it in the Notes field
          </li>
          <li>
            Fill Part A using this page, then Part B (all No for standard cases)
          </li>
          <li>Note the File Reference Number after submission</li>
        </ol>
      </div>

      <div
        className="no-print rounded-xl border border-slate-200 bg-white shadow-sm"
        data-testid="form-fill-portal-prerequisites"
      >
        <button
          type="button"
          onClick={() => setPortalPrepOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
          aria-expanded={portalPrepOpen}
        >
          <span>Govt portal prerequisites (live status)</span>
          <span className="text-slate-500" aria-hidden>
            {portalPrepOpen ? "▼" : "▶"}
          </span>
        </button>
        {portalPrepOpen ? (
          <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
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
                {OCI_NEW_CHECKLIST.map((item) => (
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
          </div>
        ) : null}
      </div>

      <div
        className="no-print rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
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
      </div>

      {manual > 0 ? (
        <div
          className="no-print rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
          data-testid="form-fill-manual-banner"
        >
          {manual} field{manual === 1 ? "" : "s"} need manual entry
        </div>
      ) : null}

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
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
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

          return (
            <section
              key={sec.blockId}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none"
            >
              <div className="mb-4 border-b border-blue-200 pb-2">
                {sec.collapsible ? (
                  <button
                    type="button"
                    onClick={sec.onFormerToggle}
                    className="fill-print-section-title flex w-full items-center gap-2 text-left text-lg font-bold text-[#1e3a5f]"
                  >
                    <span className="text-slate-500" aria-hidden>
                      {sec.formerOpen ? "▼" : "▶"}
                    </span>
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
                <div className="divide-y divide-slate-100">
                  {sec.rows.map(renderRow)}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
