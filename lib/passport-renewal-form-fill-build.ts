import type { Dispatch, SetStateAction } from "react";

import {
  canonicalSynonymKey,
  findRowByKeysAndSources,
  formFillSourceTagForRow,
  getValueByKeysAndSources,
  PASSPORT_RENEWAL_FORM_FILL_BLOCKS,
  resolveFormFillSourceOrder,
  resolvePassportFullName,
  type FormFillFieldDef,
} from "@/lib/form-fill-sections";
import {
  collectFlagMetaForFillPage,
  formatPortalDate,
} from "@/lib/oci-govt-fill-resolve";
import type { GovtFillRowConfig, OciFormFillSectionPlan } from "@/lib/oci-form-fill-build";
import type { ExtractedField } from "@/lib/types";

export function buildPassportRenewalFormFillPlan(args: {
  fields: ExtractedField[];
  setFields: Dispatch<SetStateAction<ExtractedField[]>>;
  persistExtractedField: (id: string, v: string) => void | Promise<void>;
  localPhone: string;
  setLocalPhone: (v: string) => void;
  localEmail: string;
  setLocalEmail: (v: string) => void;
  married: boolean;
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
    married,
    applicantIsMinor,
  } = args;

  const rowFromDef = (
    blockId: string,
    stableId: string,
    def: FormFillFieldDef,
  ): GovtFillRowConfig | null => {
    if (def.displayOnly || def.referenceOnly) return null;
    if (
      applicantIsMinor &&
      def.keys.some(
        (k) =>
          k === "marital_status" ||
          k === "marital" ||
          k.startsWith("spouse_"),
      )
    ) {
      return null;
    }
    if (!married && def.keys.some((k) => k.startsWith("spouse_"))) {
      return null;
    }

    const fillCtx = { blockId, applicantIsMinor };
    const src = resolveFormFillSourceOrder(def, fillCtx);

    const isFullNamePersonal =
      blockId === "renewal_personal" &&
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

    if (blockId === "renewal_present_address" && def.label === "Phone") {
      if (!raw.trim()) raw = localPhone;
    }
    if (blockId === "renewal_present_address" && def.label === "Email") {
      if (!raw.trim()) raw = localEmail;
    }

    const isDateField = def.keys.some((k) =>
      /dob|date_of_birth|issue_date|expiry|passport_issue|_dob/i.test(k),
    );
    const shown = (isDateField ? formatPortalDate(raw) || raw : raw) || raw;

    const current = row ? fields.find((f) => f.id === row.id) : undefined;
    let inputVal = String(current?.field_value ?? raw ?? "");

    if (blockId === "renewal_present_address" && def.label === "Phone") {
      if (!inputVal.trim()) inputVal = localPhone;
    }
    if (blockId === "renewal_present_address" && def.label === "Email") {
      if (!inputVal.trim()) inputVal = localEmail;
    }

    const labelBase =
      def.optional && def.tag
        ? `${def.label} · ${def.tag}`
        : def.optional
          ? `${def.label} (optional)`
          : def.label;

    const minorPresentPrefix =
      applicantIsMinor && blockId === "renewal_present_address"
        ? "Parent's address (from address proof) · "
        : "";

    const sourceTag = formFillSourceTagForRow(row, fillCtx);

    const flagMeta = collectFlagMetaForFillPage(flagSourceRows);

    const isPresentPhoneOrEmail =
      blockId === "renewal_present_address" &&
      (def.label === "Phone" || def.label === "Email");

    const onIn =
      row && !isPresentPhoneOrEmail
        ? (v: string) =>
            setFields((p) =>
              p.map((f) => (f.id === row.id ? { ...f, field_value: v } : f)),
            )
        : def.label === "Phone" && blockId === "renewal_present_address"
          ? setLocalPhone
          : def.label === "Email" && blockId === "renewal_present_address"
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

  for (const block of PASSPORT_RENEWAL_FORM_FILL_BLOCKS) {
    const rows: GovtFillRowConfig[] = [];
    let idx = 0;
    for (const def of block.fields) {
      if (def.displayOnly || def.referenceOnly) continue;
      const r = rowFromDef(block.id, `${block.id}-${idx++}`, def);
      if (r) rows.push(r);
    }
    plans.push({
      blockId: block.id,
      title: block.title,
      subtitle: block.subtitle,
      rows,
    });
  }

  return plans;
}
