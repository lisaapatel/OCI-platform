/**
 * @jest-environment node
 */

import {
  formatAutoReconConflictNote,
  formatAutoReconNote,
  parseAutoReconNote,
} from "@/lib/cross-doc-reconcile/constants";
import { computeReconciliationUpdates } from "@/lib/cross-doc-reconcile/compute-updates";
import {
  normalizeDateForCompare,
  normalizeFieldValue,
  normalizeTextForCompare,
} from "@/lib/cross-doc-reconcile/normalize";
import type { ReconRow } from "@/lib/cross-doc-reconcile/compute-updates";

describe("cross-doc-reconcile normalize", () => {
  test("normalizeTextForCompare lowercases and strips punctuation", () => {
    expect(normalizeTextForCompare("  John, A. Doe! ")).toBe("john a doe");
  });

  test("normalizeDateForCompare ISO passthrough", () => {
    expect(normalizeDateForCompare("1990-05-15")).toBe("1990-05-15");
  });

  test("normalizeDateForCompare DD/MM/YYYY", () => {
    expect(normalizeDateForCompare("15/05/1990")).toBe("1990-05-15");
  });

  test("normalizeFieldValue passport strips spaces", () => {
    expect(normalizeFieldValue("AB 12 34 56", "passport_number")).toBe(
      "ab123456"
    );
  });
});

describe("cross-doc-reconcile constants", () => {
  test("parseAutoReconNote", () => {
    expect(parseAutoReconNote(formatAutoReconNote("confirmed"))).toBe(
      "confirmed"
    );
    expect(parseAutoReconNote(formatAutoReconNote("single_source"))).toBe(
      "single_source"
    );
    expect(
      parseAutoReconNote(formatAutoReconConflictNote("a | b"))
    ).toBe("conflict");
    expect(parseAutoReconNote("manual")).toBeNull();
  });
});

describe("computeReconciliationUpdates", () => {
  const row = (partial: Partial<ReconRow> & Pick<ReconRow, "id">): ReconRow => ({
    id: partial.id,
    field_name: partial.field_name ?? "date_of_birth",
    field_value: partial.field_value ?? null,
    source_doc_type: partial.source_doc_type ?? "current_passport",
    is_flagged: partial.is_flagged ?? false,
    flag_note: partial.flag_note ?? null,
  });

  test("no rows → no updates", () => {
    expect(computeReconciliationUpdates([])).toEqual([]);
  });

  test("single source date_of_birth", () => {
    const rows: ReconRow[] = [
      row({
        id: "a",
        field_name: "date_of_birth",
        field_value: "1990-01-15",
        source_doc_type: "current_passport",
      }),
    ];
    const u = computeReconciliationUpdates(rows);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({
      id: "a",
      is_flagged: false,
      flag_note: "AUTO_RECON:single_source",
    });
  });

  test("confirmed across two docs", () => {
    const rows: ReconRow[] = [
      row({
        id: "a",
        field_name: "date_of_birth",
        field_value: "15/01/1990",
        source_doc_type: "current_passport",
      }),
      row({
        id: "b",
        field_name: "dob",
        field_value: "1990-01-15",
        source_doc_type: "birth_certificate",
      }),
    ];
    const u = computeReconciliationUpdates(rows);
    expect(u).toHaveLength(2);
    expect(u.every((x) => x.flag_note === "AUTO_RECON:confirmed")).toBe(true);
    expect(u.every((x) => !x.is_flagged)).toBe(true);
  });

  test("conflict across two docs", () => {
    const rows: ReconRow[] = [
      row({
        id: "a",
        field_name: "date_of_birth",
        field_value: "1990-01-15",
        source_doc_type: "current_passport",
      }),
      row({
        id: "b",
        field_name: "dob",
        field_value: "1991-01-15",
        source_doc_type: "birth_certificate",
      }),
    ];
    const u = computeReconciliationUpdates(rows);
    expect(u).toHaveLength(2);
    expect(u.every((x) => x.is_flagged)).toBe(true);
    expect(u[0].flag_note.startsWith("AUTO_RECON:conflict|")).toBe(true);
  });

  test("skips when manual operator flag on participant", () => {
    const rows: ReconRow[] = [
      row({
        id: "a",
        field_name: "date_of_birth",
        field_value: "1990-01-15",
        source_doc_type: "current_passport",
        is_flagged: true,
        flag_note: "check this",
      }),
      row({
        id: "b",
        field_name: "dob",
        field_value: "1990-01-15",
        source_doc_type: "birth_certificate",
      }),
    ];
    expect(computeReconciliationUpdates(rows)).toEqual([]);
  });

  test("full_name confirmed from first middle last", () => {
    const rows: ReconRow[] = [
      row({
        id: "f1",
        field_name: "first_name",
        field_value: "John",
        source_doc_type: "current_passport",
      }),
      row({
        id: "l1",
        field_name: "last_name",
        field_value: "Doe",
        source_doc_type: "current_passport",
      }),
      row({
        id: "f2",
        field_name: "first_name",
        field_value: "John",
        source_doc_type: "birth_certificate",
      }),
      row({
        id: "l2",
        field_name: "last_name",
        field_value: "Doe",
        source_doc_type: "birth_certificate",
      }),
    ];
    const u = computeReconciliationUpdates(rows);
    const ids = new Set(u.map((x) => x.id));
    expect(ids.has("f1")).toBe(true);
    expect(ids.has("l1")).toBe(true);
    expect(ids.has("f2")).toBe(true);
    expect(ids.has("l2")).toBe(true);
    expect(u.every((x) => x.flag_note === "AUTO_RECON:confirmed")).toBe(true);
  });
});
