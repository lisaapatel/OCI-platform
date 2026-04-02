"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildExtractedFieldLookupMap } from "@/lib/form-fill-sections";
import {
  PORTAL_IMAGE_MAX_KB,
  PORTAL_PDF_MAX_KB,
} from "@/lib/portal-constants";
import { OCI_NEW_CHECKLIST } from "@/lib/oci-new-checklist";
import {
  isPortalPdfChecklistItem,
  type PortalReadinessSnapshot,
} from "@/lib/portal-readiness";
import { isSpouseNameNa } from "@/lib/form-fill-spouse-na";
import {
  buildGivenName,
  buildNativePlace,
  buildPresentAddress,
  buildPreviousName,
  collectFlagMeta,
  formatPortalDate,
  getRowByKeys,
  getValueByKeys,
} from "@/lib/oci-govt-fill-resolve";
import type { ExtractedField } from "@/lib/types";

const COPY_FLASH_MS = 1500;

const OCCUPATION_OPTIONS = ["BUSINESS", "SERVICE", "STUDENT", "OTHER"] as const;

type FlagMeta = { flagged: boolean; notes: string[] };

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

type GovtFillRowConfig = {
  stableId: string;
  govtLabel: string;
  /** Copy / display source (extracted or local) */
  copyText: string;
  /** Subtle hint when there was no auto-extracted value */
  showNoAutoDataHint: boolean;
  flagMeta: FlagMeta;
  mode: "input" | "select";
  inputValue?: string;
  onInputChange?: (v: string) => void;
  onBlurPersist?: (value: string) => void | Promise<void>;
  inputPlaceholder?: string;
  selectValue?: string;
  onSelectChange?: (v: string) => void;
  selectPlaceholder?: string;
};

type GovtFillRowProps = GovtFillRowConfig & {
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
};

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
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 print:text-black">
          {govtLabel}
        </span>

        {mode === "input" ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="min-w-[200px] flex-1 max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-medium text-slate-900 print:border-slate-400"
              value={inputValue ?? ""}
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
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 print:border-red-600"
            role="alert"
          >
            <span className="font-semibold">⚠ Flagged:</span>{" "}
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

  const byName = useMemo(
    () => buildExtractedFieldLookupMap(fields),
    [fields]
  );

  const [fatherNationality, setFatherNationality] = useState("INDIA");
  const [motherNationality, setMotherNationality] = useState("INDIA");
  const [visibleMark, setVisibleMark] = useState("");
  const [spousePassport, setSpousePassport] = useState("");
  const [occupation, setOccupation] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");
  const [localEmail, setLocalEmail] = useState(() =>
    (customerEmail ?? "").trim()
  );
  const [localPhone, setLocalPhone] = useState(() =>
    (customerPhone ?? "").trim()
  );

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

  const rowPropsList = useMemo((): GovtFillRowConfig[] => {
    const by = byName;
    const given = buildGivenName(by);
    const prev = buildPreviousName(by);
    const spouseFromKeys = getValueByKeys(by, [
      "spouse_name",
      "spouse_full_name",
      "husband_name",
      "wife_name",
    ]);
    const spouseRow = getRowByKeys(by, [
      "spouse_name",
      "spouse_full_name",
      "husband_name",
      "wife_name",
    ]);
    const spouseEffective = spouseRow
      ? (fields.find((f) => f.id === spouseRow.id)?.field_value ??
        spouseFromKeys)
      : spouseFromKeys;
    const hideSpousePassport = isSpouseNameNa(spouseEffective);
    const present = buildPresentAddress(by);
    const native = buildNativePlace(by);

    const givenFirstRow = getRowByKeys(by, [
      "first_name",
      "given_name",
      "forename",
    ]);
    const givenFirstFieldVal = givenFirstRow
      ? fields.find((f) => f.id === givenFirstRow.id)?.field_value
      : undefined;

    const extInput = (
      stableId: string,
      label: string,
      keys: string[],
      flagRows: (ExtractedField | undefined)[],
      opts?: { formatDisplay?: (raw: string) => string }
    ): GovtFillRowConfig => {
      const row = getRowByKeys(by, keys);
      const raw = getValueByKeys(by, keys);
      const shown = opts?.formatDisplay
        ? opts.formatDisplay(raw) || raw
        : raw;
      const current = row
        ? fields.find((f) => f.id === row.id)
        : undefined;
      const inputValue = current?.field_value ?? "";
      const hasValueInForm = !!inputValue.trim();
      const hasValueFromMap = !!raw.trim();
      return {
        stableId,
        govtLabel: label,
        copyText: shown || raw,
        showNoAutoDataHint: !hasValueFromMap && !hasValueInForm,
        flagMeta: collectFlagMeta(flagRows),
        mode: "input",
        inputValue,
        onInputChange: row
          ? (v) =>
              setFields((prev) =>
                prev.map((f) =>
                  f.id === row.id ? { ...f, field_value: v } : f
                )
              )
          : undefined,
        onBlurPersist: row
          ? (v) => void persistExtractedField(row.id, v)
          : undefined,
        inputPlaceholder: "",
      };
    };

    const allRows: GovtFillRowConfig[] = [
      extInput("f1", "Surname", ["last_name", "surname", "family_name"], [
        getRowByKeys(by, ["last_name", "surname", "family_name"]),
      ]),
      {
        stableId: "f2",
        govtLabel: "Given Name",
        copyText: given.text,
        showNoAutoDataHint: !given.text.trim(),
        flagMeta: collectFlagMeta(given.rows),
        mode: "input",
        inputValue: givenFirstRow ? (givenFirstFieldVal ?? "") : given.text,
        onInputChange: givenFirstRow
          ? (v) =>
              setFields((prev) =>
                prev.map((f) =>
                  f.id === givenFirstRow.id ? { ...f, field_value: v } : f
                )
              )
          : undefined,
        onBlurPersist: givenFirstRow
          ? (v) => void persistExtractedField(givenFirstRow.id, v)
          : undefined,
        inputPlaceholder: "",
      },
      extInput(
        "f3",
        "Previous Name",
        [
          "previous_name",
          "maiden_name",
          "former_name",
          "name_changed_from",
        ],
        prev.rows
      ),
      extInput("f4", "Sex", ["gender", "sex"], [
        getRowByKeys(by, ["gender", "sex"]),
      ]),
      extInput(
        "f5",
        "Date of Birth",
        ["date_of_birth", "dob", "birth_date"],
        [getRowByKeys(by, ["date_of_birth", "dob", "birth_date"])],
        { formatDisplay: (r) => formatPortalDate(r) || r }
      ),
      extInput(
        "f6",
        "Country of Birth",
        [
          "country_of_birth",
          "birth_country",
          "place_of_birth_country",
        ],
        [
          getRowByKeys(by, [
            "country_of_birth",
            "birth_country",
            "place_of_birth_country",
          ]),
        ]
      ),
      extInput(
        "f7",
        "Place of Birth",
        ["place_of_birth", "birth_place", "pob"],
        [getRowByKeys(by, ["place_of_birth", "birth_place", "pob"])]
      ),
      extInput(
        "f8",
        "Current Nationality",
        ["current_nationality", "nationality", "citizenship"],
        [
          getRowByKeys(by, [
            "current_nationality",
            "nationality",
            "citizenship",
          ]),
        ]
      ),
      {
        stableId: "f9",
        govtLabel: "Visible Mark",
        copyText: visibleMark,
        showNoAutoDataHint: !visibleMark.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: visibleMark,
        onInputChange: setVisibleMark,
        inputPlaceholder: "Optional — team use",
      },
      extInput("f10", "Marital Status", ["marital_status", "marital"], [
        getRowByKeys(by, ["marital_status", "marital"]),
      ]),
      extInput(
        "f11",
        "Passport Number",
        ["passport_number", "passport_no", "passport_num", "document_number"],
        [
          getRowByKeys(by, [
            "passport_number",
            "passport_no",
            "document_number",
          ]),
        ]
      ),
      extInput(
        "f12",
        "Date of Issue",
        [
          "passport_issue_date",
          "issue_date",
          "date_of_issue",
          "doi",
        ],
        [
          getRowByKeys(by, [
            "passport_issue_date",
            "issue_date",
            "date_of_issue",
          ]),
        ],
        { formatDisplay: (r) => formatPortalDate(r) || r }
      ),
      extInput(
        "f13",
        "Place of Issue",
        ["place_of_issue", "issuing_authority", "issuing_office", "poi"],
        [getRowByKeys(by, ["place_of_issue", "issuing_authority", "poi"])]
      ),
      extInput(
        "f14",
        "Father's Name",
        ["father_full_name", "father_name", "fathers_name", "father"],
        [getRowByKeys(by, ["father_full_name", "father_name", "father"])]
      ),
      {
        stableId: "f15",
        govtLabel: "Father's Nationality",
        copyText: fatherNationality,
        showNoAutoDataHint: !fatherNationality.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: fatherNationality,
        onInputChange: setFatherNationality,
        inputPlaceholder: "Nationality",
      },
      extInput(
        "f16",
        "Mother's Name",
        ["mother_full_name", "mother_name", "mothers_name", "mother"],
        [getRowByKeys(by, ["mother_full_name", "mother_name", "mother"])]
      ),
      {
        stableId: "f17",
        govtLabel: "Mother's Nationality",
        copyText: motherNationality,
        showNoAutoDataHint: !motherNationality.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: motherNationality,
        onInputChange: setMotherNationality,
        inputPlaceholder: "Nationality",
      },
      {
        stableId: "f18",
        govtLabel: "Spouse's Name",
        copyText: spouseEffective.trim() ? spouseEffective : "N/A",
        showNoAutoDataHint:
          !spouseFromKeys.trim() &&
          !(fields.find((f) => f.id === spouseRow?.id)?.field_value ?? "")
            .trim(),
        flagMeta: collectFlagMeta([
          getRowByKeys(by, [
            "spouse_name",
            "spouse_full_name",
            "husband_name",
            "wife_name",
          ]),
        ]),
        mode: "input",
        inputValue: spouseRow
          ? (fields.find((f) => f.id === spouseRow.id)?.field_value ??
            spouseFromKeys)
          : spouseFromKeys,
        onInputChange: spouseRow
          ? (v) =>
              setFields((prev) =>
                prev.map((f) =>
                  f.id === spouseRow.id ? { ...f, field_value: v } : f
                )
              )
          : undefined,
        onBlurPersist: spouseRow
          ? (v) => void persistExtractedField(spouseRow.id, v)
          : undefined,
        inputPlaceholder: "N/A if not married",
      },
      {
        stableId: "f19",
        govtLabel: "Spouse's Passport No",
        copyText: spousePassport,
        showNoAutoDataHint: !spousePassport.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: spousePassport,
        onInputChange: setSpousePassport,
        inputPlaceholder: "If applicable",
      },
      {
        stableId: "f20",
        govtLabel: "Occupation",
        copyText: occupation,
        showNoAutoDataHint: !occupation.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "select",
        selectValue: occupation,
        onSelectChange: setOccupation,
        selectPlaceholder: "Choose occupation",
      },
      {
        stableId: "f21",
        govtLabel: "Address of Employer",
        copyText: employerAddress,
        showNoAutoDataHint: !employerAddress.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: employerAddress,
        onInputChange: setEmployerAddress,
        inputPlaceholder: "Employer address",
      },
      (() => {
        const pr = present.rows[0];
        const prVal = pr
          ? fields.find((f) => f.id === pr.id)?.field_value
          : undefined;
        return {
          stableId: "f22",
          govtLabel: "Present Address",
          copyText: present.text,
          showNoAutoDataHint:
            !present.text.trim() && !(prVal ?? "").trim(),
          flagMeta: collectFlagMeta(present.rows),
          mode: "input" as const,
          inputValue: pr ? (prVal ?? "") : present.text,
          onInputChange: pr
            ? (v) =>
                setFields((prev) =>
                  prev.map((f) =>
                    f.id === pr.id ? { ...f, field_value: v } : f
                  )
                )
            : undefined,
          onBlurPersist: pr
            ? (v) => void persistExtractedField(pr.id, v)
            : undefined,
          inputPlaceholder: "",
        };
      })(),
      {
        stableId: "f23",
        govtLabel: "Mobile No",
        copyText: localPhone,
        showNoAutoDataHint: !localPhone.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: localPhone,
        onInputChange: setLocalPhone,
        inputPlaceholder: "Customer mobile",
      },
      {
        stableId: "f24",
        govtLabel: "Email",
        copyText: localEmail,
        showNoAutoDataHint: !localEmail.trim(),
        flagMeta: { flagged: false, notes: [] },
        mode: "input",
        inputValue: localEmail,
        onInputChange: setLocalEmail,
        inputPlaceholder: "Customer email",
      },
      (() => {
        const nr = native.rows[0];
        const nrVal = nr
          ? fields.find((f) => f.id === nr.id)?.field_value
          : undefined;
        return {
          stableId: "f25",
          govtLabel: "Native Place Address",
          copyText: native.text,
          showNoAutoDataHint:
            !native.text.trim() && !(nrVal ?? "").trim(),
          flagMeta: collectFlagMeta(native.rows),
          mode: "input" as const,
          inputValue: nr ? (nrVal ?? "") : native.text,
          onInputChange: nr
            ? (v) =>
                setFields((prev) =>
                  prev.map((f) =>
                    f.id === nr.id ? { ...f, field_value: v } : f
                  )
                )
            : undefined,
          onBlurPersist: nr
            ? (v) => void persistExtractedField(nr.id, v)
            : undefined,
          inputPlaceholder: "",
        };
      })(),
    ];

    return allRows.filter(
      (r) => r.stableId !== "f19" || !hideSpousePassport
    );
  }, [
    byName,
    fields,
    visibleMark,
    spousePassport,
    occupation,
    employerAddress,
    fatherNationality,
    motherNationality,
    persistExtractedField,
    localEmail,
    localPhone,
  ]);

  const visibleFieldCount = rowPropsList.length;

  const sectionRows = useMemo(() => {
    const m = new Map(rowPropsList.map((r) => [r.stableId, r]));
    const pick = (ids: string[]) =>
      ids
        .map((id) => m.get(id))
        .filter((r): r is GovtFillRowConfig => r != null);
    return {
      personal: pick([
        "f1",
        "f2",
        "f3",
        "f4",
        "f5",
        "f6",
        "f7",
        "f8",
        "f9",
        "f10",
      ]),
      passport: pick(["f11", "f12", "f13"]),
      family: pick(["f14", "f15", "f16", "f17", "f18", "f19"]),
      occupation: pick(["f20", "f21", "f22", "f23", "f24", "f25"]),
    };
  }, [rowPropsList]);

  const { filled, manual } = useMemo(() => {
    let f = 0;
    let m = 0;
    for (const r of rowPropsList) {
      let has = false;
      if (r.mode === "input") has = (r.inputValue ?? "").trim().length > 0;
      else if (r.mode === "select")
        has = (r.selectValue ?? "").trim().length > 0;
      else has = r.copyText.trim().length > 0;
      if (has) f += 1;
      else m += 1;
    }
    return { filled: f, manual: m };
  }, [rowPropsList]);

  const renderRow = (r: GovtFillRowConfig) => (
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
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
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

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <h2 className="fill-print-section-title mb-2 border-b border-blue-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            SECTION 2 — Personal Details
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Matches Part A of the govt form (order preserved).
          </p>
          <div className="divide-y divide-slate-100">
            {sectionRows.personal.map(renderRow)}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <h2 className="fill-print-section-title mb-4 border-b border-blue-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            SECTION 3 — Passport Details
          </h2>
          <div className="divide-y divide-slate-100">
            {sectionRows.passport.map(renderRow)}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <h2 className="fill-print-section-title mb-4 border-b border-blue-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            SECTION 4 — Family Details
          </h2>
          <div className="divide-y divide-slate-100">
            {sectionRows.family.map(renderRow)}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <h2 className="fill-print-section-title mb-4 border-b border-blue-200 pb-2 text-lg font-bold text-[#1e3a5f]">
            SECTION 5 — Occupation &amp; Address
          </h2>
          <p className="mb-4 text-xs text-slate-500">Page II of the govt form.</p>
          <div className="divide-y divide-slate-100">
            {sectionRows.occupation.map(renderRow)}
          </div>
        </section>
      </div>
    </div>
  );
}
