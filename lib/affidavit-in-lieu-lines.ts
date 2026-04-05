import type { ChecklistItem } from "@/lib/oci-new-checklist";

const PHOTOCOPY_PREFIX = "Photocopy of ";

/**
 * Build affidavit document lines in checklist order (max seven).
 * Caller must ensure `selectedDocTypes` has 1–7 members, all present on `checklist`.
 */
export function buildAffidavitPhotocopyLines(
  checklist: ChecklistItem[],
  selectedDocTypes: Set<string>,
): string[] {
  const lines: string[] = [];
  for (const row of checklist) {
    if (selectedDocTypes.has(row.doc_type)) {
      lines.push(`${PHOTOCOPY_PREFIX}${row.label}`);
      if (lines.length >= 7) break;
    }
  }
  return lines;
}

export function normalizeAffidavitCustomLines(customLines: string[]): string[] {
  return customLines
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);
}

export function validateAffidavitSelection(
  checklist: ChecklistItem[],
  selectedDocTypes: string[],
  customLines: string[] = [],
):
  | { ok: true; selectedSet: Set<string>; normalizedCustomLines: string[] }
  | { ok: false; error: string; status: 400 | 422 } {
  const allowed = new Set(checklist.map((c) => c.doc_type));
  const selectedSet = new Set<string>();
  const normalizedCustomLines = normalizeAffidavitCustomLines(customLines);
  for (const raw of selectedDocTypes) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    if (!allowed.has(t)) {
      return {
        ok: false,
        error: `Unknown or invalid document type: ${t}`,
        status: 400,
      };
    }
    selectedSet.add(t);
  }
  const totalLines = selectedSet.size + normalizedCustomLines.length;
  if (totalLines === 0) {
    return {
      ok: false,
      error:
        "Select at least one checklist document or add at least one custom line.",
      status: 422,
    };
  }
  if (totalLines > 7) {
    return {
      ok: false,
      error:
        "Select at most seven documents (the affidavit has lines (a) through (g)).",
      status: 422,
    };
  }
  return { ok: true, selectedSet, normalizedCustomLines };
}

export function buildAffidavitDocumentLines(
  checklist: ChecklistItem[],
  selectedDocTypes: Set<string>,
  customLines: string[],
): string[] {
  const checklistLines = buildAffidavitPhotocopyLines(checklist, selectedDocTypes);
  return [...checklistLines, ...normalizeAffidavitCustomLines(customLines)];
}
