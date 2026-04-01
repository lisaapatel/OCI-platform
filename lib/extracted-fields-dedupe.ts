import type { ExtractedField } from "@/lib/types";

export type ExtractedFieldRow = ExtractedField & {
  updated_at?: string | null;
  created_at?: string | null;
};

function rowTimestamp(r: ExtractedFieldRow): number {
  const s = (r.updated_at ?? r.created_at ?? "").trim();
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Keeps one row per (source_doc_type, field_name): the most recently updated row wins.
 * Order Supabase by updated_at desc before calling for stable behavior.
 */
export function dedupeExtractedFieldsLatest(
  rows: ExtractedFieldRow[]
): ExtractedField[] {
  const sorted = [...rows].sort((a, b) => {
    const d = rowTimestamp(b) - rowTimestamp(a);
    if (d !== 0) return d;
    return String(b.id).localeCompare(String(a.id));
  });
  const seen = new Set<string>();
  const out: ExtractedField[] = [];
  for (const f of sorted) {
    const key = `${f.source_doc_type}\0${f.field_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: f.id,
      application_id: f.application_id,
      field_name: f.field_name,
      field_value: f.field_value,
      source_doc_type: f.source_doc_type,
      is_flagged: f.is_flagged,
      flag_note: f.flag_note,
      reviewed_by: f.reviewed_by,
      reviewed_at: f.reviewed_at,
    });
  }
  return out;
}
