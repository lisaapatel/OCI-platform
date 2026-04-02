/** Machine-parsable prefix for cross-document reconciliation in `flag_note`. */
export const AUTO_RECON_PREFIX = "AUTO_RECON:";

export type AutoReconKind = "confirmed" | "single_source" | "conflict";

export function formatAutoReconNote(
  kind: Exclude<AutoReconKind, "conflict">,
): string {
  return `${AUTO_RECON_PREFIX}${kind}`;
}

export function formatAutoReconConflictNote(detail: string): string {
  const d = detail.trim().slice(0, 500);
  return `${AUTO_RECON_PREFIX}conflict|${d}`;
}

export function parseAutoReconNote(
  flagNote: string | null | undefined,
): AutoReconKind | null {
  const s = String(flagNote ?? "").trim();
  if (!s.startsWith(AUTO_RECON_PREFIX)) return null;
  const rest = s.slice(AUTO_RECON_PREFIX.length);
  if (rest === "confirmed") return "confirmed";
  if (rest === "single_source") return "single_source";
  if (rest.startsWith("conflict|")) return "conflict";
  return null;
}

export function isAutoReconNote(flagNote: string | null | undefined): boolean {
  return String(flagNote ?? "").trim().startsWith(AUTO_RECON_PREFIX);
}
