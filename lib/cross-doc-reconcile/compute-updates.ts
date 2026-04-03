import {
  formatAutoReconConflictNote,
  formatAutoReconNote,
  isAutoReconNote,
} from "@/lib/cross-doc-reconcile/constants";
import { normalizeFieldValue } from "@/lib/cross-doc-reconcile/normalize";
import {
  RECON_ATOMIC_RULES,
  isAddressProofApplicantNameRow,
  synonymSetForAtomicRule,
  allowedDocTypeSet,
  type ReconLogicalKey,
} from "@/lib/cross-doc-reconcile/config";
import { normalizeStoredFieldKey } from "@/lib/form-fill-sections";
import { resolveDocTypeChecklistLabel } from "@/lib/application-checklist";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";

export type ReconRow = {
  id: string;
  field_name: string;
  field_value: string | null;
  source_doc_type: string;
  is_flagged: boolean;
  flag_note: string | null;
};

export type ReconFieldUpdate = {
  id: string;
  is_flagged: boolean;
  flag_note: string;
};

export type AllowedDocTypeSkipEvent = {
  logicalKey: string;
  sourceDocType: string;
  count: number;
  allowedDocTypes: readonly string[];
};

export type ReconciliationComputeResult = {
  updates: ReconFieldUpdate[];
  skippedDueToAllowedDocTypes: AllowedDocTypeSkipEvent[];
};

function hasManualOperatorFlag(r: ReconRow): boolean {
  if (!r.is_flagged) return false;
  return !isAutoReconNote(r.flag_note);
}

function filterRows(rows: ReconRow[]): ReconRow[] {
  return rows.filter(
    (r) =>
      !shouldSkipAiExtraction(r.source_doc_type) &&
      !isAddressProofApplicantNameRow(r),
  );
}

function labelDoc(dt: string): string {
  return resolveDocTypeChecklistLabel(dt);
}

/** Heuristic: document-specific identifiers must never participate in cross-doc reconciliation. */
export function looksLikeDocumentSpecificIdentifier(
  fieldKeyNormalized: string,
): boolean {
  const k = fieldKeyNormalized.toLowerCase();
  if (k.includes("certificate")) return true;
  if (k.includes("reference")) return true;
  if (k.includes("registration")) return true;
  if (k.includes("number")) return true;
  if (
    k === "id" ||
    k.endsWith("_id") ||
    k.includes("_id_") ||
    k.startsWith("id_")
  ) {
    return true;
  }
  return false;
}

function bumpSkip(
  skips: Map<string, AllowedDocTypeSkipEvent>,
  logicalKey: string,
  sourceDocType: string,
  allowed: readonly string[],
) {
  const mapKey = `${logicalKey}::${sourceDocType}`;
  const prev = skips.get(mapKey);
  if (prev) {
    prev.count += 1;
  } else {
    skips.set(mapKey, {
      logicalKey,
      sourceDocType,
      count: 1,
      allowedDocTypes: allowed,
    });
  }
}

/** Per doc_type: first non-empty value among synonym rows + all contributing row ids. */
function gatherAtomicByDoc(
  rows: ReconRow[],
  rule: (typeof RECON_ATOMIC_RULES)[number],
  skipMap: Map<string, AllowedDocTypeSkipEvent>,
): Map<string, { norm: string; display: string; ids: string[] }> {
  const logicalKey = rule.seed;
  const synonymKeys = synonymSetForAtomicRule(rule);
  const allowedTypes = allowedDocTypeSet(rule.allowedDocTypes);
  const out = new Map<string, { norm: string; display: string; ids: string[] }>();
  const byDocNorms = new Map<string, Map<string, { display: string; ids: string[] }>>();

  for (const r of filterRows(rows)) {
    const fn = normalizeStoredFieldKey(r.field_name);
    if (!synonymKeys.has(fn)) continue;
    if (looksLikeDocumentSpecificIdentifier(fn)) continue;
    if (!allowedTypes.has(r.source_doc_type)) {
      bumpSkip(skipMap, logicalKey, r.source_doc_type, rule.allowedDocTypes);
      continue;
    }
    const raw = String(r.field_value ?? "").trim();
    if (!raw) continue;
    const norm = normalizeFieldValue(raw, logicalKey);
    if (!norm) continue;
    const dt = r.source_doc_type;
    if (!byDocNorms.has(dt)) byDocNorms.set(dt, new Map());
    const m = byDocNorms.get(dt)!;
    const prev = m.get(norm);
    if (prev) {
      if (!prev.ids.includes(r.id)) prev.ids.push(r.id);
    } else {
      m.set(norm, { display: raw, ids: [r.id] });
    }
  }

  for (const [dt, normMap] of byDocNorms) {
    if (normMap.size === 0) continue;
    if (normMap.size > 1) {
      const parts: string[] = [];
      const allIds: string[] = [];
      for (const { display, ids } of normMap.values()) {
        parts.push(`${labelDoc(dt)}: ${display}`);
        allIds.push(...ids);
      }
      out.set(dt, {
        norm: "__internal_conflict__",
        display: parts.join(" | "),
        ids: [...new Set(allIds)],
      });
      continue;
    }
    const only = [...normMap.entries()][0];
    out.set(dt, {
      norm: only[0],
      display: only[1].display,
      ids: only[1].ids,
    });
  }
  return out;
}

function participantIdsFromByDoc(
  byDoc: Map<string, { ids: string[] }>,
): string[] {
  const s = new Set<string>();
  for (const v of byDoc.values()) {
    for (const id of v.ids) s.add(id);
  }
  return [...s];
}

function anyManualSkip(rows: ReconRow[], ids: string[]): boolean {
  const set = new Set(ids);
  for (const r of rows) {
    if (set.has(r.id) && hasManualOperatorFlag(r)) return true;
  }
  return false;
}

function applyOutcomeToIds(
  ids: string[],
  is_flagged: boolean,
  flag_note: string,
  into: Map<string, ReconFieldUpdate>,
) {
  for (const id of ids) {
    into.set(id, { id, is_flagged, flag_note });
  }
}

/**
 * Pure: from current DB-shaped rows, compute `is_flagged` / `flag_note` updates for reconciled fields only.
 */
export function computeReconciliationUpdates(
  rows: ReconRow[],
): ReconciliationComputeResult {
  const updates = new Map<string, ReconFieldUpdate>();
  const skipMap = new Map<string, AllowedDocTypeSkipEvent>();

  const runLogical = (
    logicalKey: ReconLogicalKey,
    byDoc: Map<string, { norm: string; display: string; ids: string[] }>,
  ) => {
    const participants = participantIdsFromByDoc(byDoc);
    if (participants.length === 0) return;
    if (anyManualSkip(rows, participants)) return;

    const entries = [...byDoc.entries()].filter(([, v]) => v.norm !== "");
    const internalConflict = entries.filter(([, v]) => v.norm === "__internal_conflict__");
    const nonInternal = entries.filter(([, v]) => v.norm !== "__internal_conflict__");

    if (internalConflict.length > 0) {
      const detail = internalConflict.map(([, v]) => v.display).join(" | ");
      applyOutcomeToIds(
        participants,
        true,
        formatAutoReconConflictNote(detail),
        updates,
      );
      return;
    }

    if (nonInternal.length === 0) return;

    const norms = [...new Set(nonInternal.map(([, v]) => v.norm))];
    if (norms.length > 1) {
      const detail = nonInternal
        .map(([dt, v]) => `${labelDoc(dt)}: ${v.display}`)
        .join(" | ");
      applyOutcomeToIds(
        participants,
        true,
        formatAutoReconConflictNote(detail),
        updates,
      );
      return;
    }

    if (nonInternal.length === 1) {
      applyOutcomeToIds(
        participants,
        false,
        formatAutoReconNote("single_source"),
        updates,
      );
      return;
    }

    applyOutcomeToIds(
      participants,
      false,
      formatAutoReconNote("confirmed"),
      updates,
    );
  };

  for (const rule of RECON_ATOMIC_RULES) {
    if (!rule.allowedDocTypes?.length) continue;
    const byDoc = gatherAtomicByDoc(rows, rule, skipMap);
    runLogical(rule.seed, byDoc);
  }

  return {
    updates: [...updates.values()],
    skippedDueToAllowedDocTypes: [...skipMap.values()],
  };
}
