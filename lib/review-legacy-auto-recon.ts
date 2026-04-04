/**
 * Read-only parsing of legacy `flag_note` values that may still exist in the DB
 * from the removed cross-document auto-reconciler. No server logic writes these anymore.
 */

export const AUTO_RECON_PREFIX = "AUTO_RECON:";
const CONFLICT_PREFIX = `${AUTO_RECON_PREFIX}conflict|`;

export function parseLegacyAutoReconNote(
  flagNote: string | null | undefined
): "confirmed" | "single_source" | "conflict" | null {
  const s = String(flagNote ?? "").trim();
  if (!s.startsWith(AUTO_RECON_PREFIX)) return null;
  const rest = s.slice(AUTO_RECON_PREFIX.length);
  if (rest === "confirmed") return "confirmed";
  if (rest === "single_source") return "single_source";
  if (rest.startsWith("conflict|")) return "conflict";
  return null;
}

export function isLegacyAutoReconNote(
  flagNote: string | null | undefined
): boolean {
  return String(flagNote ?? "").trim().startsWith(AUTO_RECON_PREFIX);
}

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
  const parts = body
    .split(/\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [body];
}

export function isAutoReconConflictNote(
  flagNote: string | null | undefined
): boolean {
  return String(flagNote ?? "").trim().startsWith(CONFLICT_PREFIX);
}
