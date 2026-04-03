import { AUTO_RECON_PREFIX } from "@/lib/cross-doc-reconcile/constants";

const CONFLICT_PREFIX = `${AUTO_RECON_PREFIX}conflict|`;

/**
 * Returns pipe-separated conflict evidence strings from an auto-recon flag_note.
 * Falls back to a single-item array with the full body if not in expected shape.
 */
export function parseConflictSourcesFromFlagNote(
  flagNote: string | null | undefined
): string[] {
  const s = String(flagNote ?? "").trim();
  if (!s.startsWith(CONFLICT_PREFIX)) {
    if (s) return [s];
    return [];
  }
  const body = s.slice(CONFLICT_PREFIX.length).trim();
  if (!body) return [];
  const parts = body.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [body];
}

export function isAutoReconConflictNote(
  flagNote: string | null | undefined
): boolean {
  return String(flagNote ?? "").trim().startsWith(CONFLICT_PREFIX);
}
