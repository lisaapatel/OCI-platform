import type { Dispatch, SetStateAction } from "react";

import {
  canonicalSynonymKey,
  findRowByKeysAndSources,
  formFillSourceTagForRow,
  getValueByKeysAndSources,
  OCI_FORM_FILL_BLOCKS,
  resolveFormFillSourceOrder,
  resolvePassportFullName,
  type FormFillFieldDef,
  type FormFillSourceTag,
} from "@/lib/form-fill-sections";
import {
  collectFlagMetaForFillPage,
  formatPortalDate,
} from "@/lib/oci-govt-fill-resolve";
import type { ExtractedField } from "@/lib/types";

export type GovtFillRowConfig = {
  stableId: string;
  /** Grey one-line note row (no portal field). */
  rowKind?: "field" | "reference_note";
  referenceText?: string;
  govtLabel: string;
  copyText: string;
  showNoAutoDataHint: boolean;
  flagMeta: { flagged: boolean; notes: string[] };
  mode: "input" | "select";
  inputValue?: string;
  onInputChange?: (v: string) => void;
  onBlurPersist?: (value: string) => void | Promise<void>;
  inputPlaceholder?: string;
  readOnly?: boolean;
  selectValue?: string;
  onSelectChange?: (v: string) => void;
  selectPlaceholder?: string;
  sourceTag?: FormFillSourceTag;
};

export type OciFormFillSectionPlan = {
  blockId: string;
  title: string;
  subtitle?: string;
  collapsible?: boolean;
  formerOpen?: boolean;
  onFormerToggle?: () => void;
  showFormerEmptyHint?: boolean;
  permanentToggle?: boolean;
  onPermanentToggle?: (v: boolean) => void;
  parentUploadNote?: boolean;
  rows: GovtFillRowConfig[];
};

export function buildOciFormFillPlan(args: {
  fields: ExtractedField[];
  setFields: Dispatch<SetStateAction<ExtractedField[]>>;
  persistExtractedField: (id: string, v: string) => void | Promise<void>;
  localPhone: string;
  setLocalPhone: (v: string) => void;
  localEmail: string;
  setLocalEmail: (v: string) => void;
  uploadedDocSet: Set<string>;
  married: boolean;
  formerIndianOpen: boolean;
  setFormerIndianOpen: Dispatch<SetStateAction<boolean>>;
  permanentSameAsPresent: boolean;
  setPermanentSameAsPresent: Dispatch<SetStateAction<boolean>>;
  hasFormerIndianExtracted: boolean;
  applicantIsMinor: boolean;
}): OciFormFillSectionPlan[] {
  const {
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
  } = args;

  const hasParentPassport =
    uploadedDocSet.has("parent_passport") ||
    uploadedDocSet.has("parent_indian_doc");
  const hasParentOci = uploadedDocSet.has("parent_oci");

  const parentDocTypeLabel =
    !hasParentPassport && !hasParentOci
      ? "Person of Indian Origin / Unknown (upload parent passport or OCI to refine)"
      : hasParentPassport && hasParentOci
        ? "Indian Passport · OCI Card (both uploaded)"
        : hasParentPassport
          ? "Indian Passport"
          : "OCI Card";

  const rowFromDef = (
    blockId: string,
    stableId: string,
    def: FormFillFieldDef
  ): GovtFillRowConfig | null => {
    if (def.displayOnly || def.referenceOnly) return null;
    if (!married && def.keys.some((k) => k.startsWith("spouse_"))) {
      return null;
    }
    if (
      def.keys.some((k) => k.includes("father_indian_passport")) &&
      !hasParentPassport
    ) {
      return null;
    }
    if (
      def.keys.some((k) => /^father_.*oci/i.test(k)) &&
      !hasParentOci
    ) {
      return null;
    }
    if (
      def.keys.some((k) => k.includes("mother_indian_passport")) &&
      !hasParentPassport
    ) {
      return null;
    }
    if (
      def.keys.some((k) => /^mother_.*oci/i.test(k)) &&
      !hasParentOci
    ) {
      return null;
    }

    const fillCtx = { blockId, applicantIsMinor };
    const src = resolveFormFillSourceOrder(def, fillCtx);

    const isFullNamePersonal =
      blockId === "personal" &&
      (def.label === "Full name" ||
        canonicalSynonymKey(def.keys[0] ?? "") === "full_name");

    let row: ExtractedField | undefined;
    let raw: string;
    let flagSourceRows: ExtractedField[] = [];

    if (isFullNamePersonal) {
      const resolved = resolvePassportFullName(fields);
      raw = resolved.value;
      row = resolved.row;
      flagSourceRows = resolved.flagRows;
    } else {
      row =
        src.length > 0
          ? findRowByKeysAndSources(fields, def.keys, src)
          : undefined;
      raw =
        src.length > 0
          ? getValueByKeysAndSources(fields, def.keys, src)
          : "";
      flagSourceRows = row ? [row] : [];
    }

    if (blockId === "present_address" && def.label === "Phone") {
      if (!raw.trim()) raw = localPhone;
    }
    if (blockId === "present_address" && def.label === "Email") {
      if (!raw.trim()) raw = localEmail;
    }

    const isDateField = def.keys.some((k) =>
      /dob|date_of_birth|issue_date|expiry|passport_issue|_dob/i.test(k)
    );
    const shown = (isDateField ? formatPortalDate(raw) || raw : raw) || raw;

    const current = row ? fields.find((f) => f.id === row.id) : undefined;
    let inputVal = String(current?.field_value ?? raw ?? "");

    if (blockId === "present_address" && def.label === "Phone") {
      if (!inputVal.trim()) inputVal = localPhone;
    }
    if (blockId === "present_address" && def.label === "Email") {
      if (!inputVal.trim()) inputVal = localEmail;
    }

    const labelBase =
      def.optional && def.tag
        ? `${def.label} · ${def.tag}`
        : def.optional
          ? `${def.label} (optional)`
          : def.label;

    const minorPresentPrefix =
      applicantIsMinor && blockId === "present_address"
        ? "Parent's address (from address proof) · "
        : "";

    const sourceTag = formFillSourceTagForRow(row, fillCtx);

    const flagMeta = collectFlagMetaForFillPage(flagSourceRows);

    const isPresentPhoneOrEmail =
      blockId === "present_address" &&
      (def.label === "Phone" || def.label === "Email");

    const onIn =
      row && !isPresentPhoneOrEmail
        ? (v: string) =>
            setFields((p) =>
              p.map((f) => (f.id === row.id ? { ...f, field_value: v } : f))
            )
        : def.label === "Phone" && blockId === "present_address"
          ? setLocalPhone
          : def.label === "Email" && blockId === "present_address"
            ? setLocalEmail
            : undefined;

    const onBlur =
      row && !isPresentPhoneOrEmail
        ? (v: string) => void persistExtractedField(row.id, v)
        : undefined;

    return {
      stableId,
      govtLabel: minorPresentPrefix + labelBase,
      copyText: shown,
      showNoAutoDataHint: !raw.trim() && !inputVal.trim(),
      flagMeta,
      mode: "input",
      inputValue: inputVal,
      onInputChange: onIn,
      onBlurPersist: onBlur,
      inputPlaceholder: "",
      sourceTag,
    };
  };

  const plans: OciFormFillSectionPlan[] = [];

  for (const block of OCI_FORM_FILL_BLOCKS) {
    if (block.id === "former_indian") {
      const rows: GovtFillRowConfig[] = [];
      let fi = 0;
      for (const def of block.fields) {
        if (def.displayOnly || def.referenceOnly) continue;
        const r = rowFromDef(block.id, `${block.id}-${fi++}`, def);
        if (r) rows.push(r);
      }
      plans.push({
        blockId: block.id,
        title: block.title,
        subtitle: block.subtitle,
        collapsible: true,
        formerOpen: formerIndianOpen,
        onFormerToggle: () => setFormerIndianOpen((o) => !o),
        showFormerEmptyHint: !hasFormerIndianExtracted,
        rows,
      });
      continue;
    }

    if (block.id === "permanent_address" && permanentSameAsPresent) {
      const presentOrder = resolveFormFillSourceOrder(
        {
          label: "",
          keys: ["address_line_1"],
          sourceDocTypes: ["address_proof", "current_passport"],
        },
        { blockId: "present_address", applicantIsMinor }
      );
      const line1 = getValueByKeysAndSources(
        fields,
        ["address_line_1", "address_line1", "street", "street_address"],
        presentOrder
      );
      const city = getValueByKeysAndSources(
        fields,
        ["city", "town"],
        presentOrder
      );
      const summary = [line1, city].filter(Boolean).join(" · ") || "—";
      plans.push({
        blockId: block.id,
        title: block.title,
        subtitle: block.subtitle,
        permanentToggle: true,
        onPermanentToggle: setPermanentSameAsPresent,
        rows: [
          {
            stableId: "perm-same-as-present",
            govtLabel: "Permanent address",
            copyText: summary,
            showNoAutoDataHint: false,
            flagMeta: { flagged: false, notes: [] },
            mode: "input",
            inputValue: "Same as present address",
            readOnly: true,
            inputPlaceholder: "",
          },
        ],
      });
      continue;
    }

    const rows: GovtFillRowConfig[] = [];
    let idx = 0;
    const fillCtxFamily = { blockId: block.id, applicantIsMinor };
    for (const def of block.fields) {
      if (def.displayOnly) continue;
      if (def.referenceOnly && block.id === "family") {
        const src = resolveFormFillSourceOrder(def, fillCtxFamily);
        const extracted =
          src.length > 0
            ? getValueByKeysAndSources(fields, def.keys, src).trim()
            : "";
        const isFather = def.keys.some((k) =>
          k.toLowerCase().includes("father"),
        );
        const label = isFather ? "Father" : "Mother";
        const text = extracted
          ? `ℹ ${label}'s doc: ${extracted}`
          : `ℹ ${label}'s doc: ${parentDocTypeLabel}`;
        rows.push({
          stableId: isFather ? "family-father-doc-ref" : "family-mother-doc-ref",
          rowKind: "reference_note",
          referenceText: text,
          govtLabel: "",
          copyText: "",
          showNoAutoDataHint: false,
          flagMeta: { flagged: false, notes: [] },
          mode: "input",
          inputValue: "",
          readOnly: true,
          inputPlaceholder: "",
        });
        continue;
      }
      const r = rowFromDef(block.id, `${block.id}-${idx++}`, def);
      if (r) rows.push(r);
    }

    plans.push({
      blockId: block.id,
      title: block.title,
      subtitle: block.subtitle,
      permanentToggle: block.id === "permanent_address",
      onPermanentToggle:
        block.id === "permanent_address"
          ? setPermanentSameAsPresent
          : undefined,
      parentUploadNote:
        block.id === "family" && !hasParentPassport && !hasParentOci,
      rows,
    });
  }

  return plans;
}

export function flattenOciFormFillRows(
  plans: OciFormFillSectionPlan[]
): GovtFillRowConfig[] {
  return plans.flatMap((p) => p.rows);
}
