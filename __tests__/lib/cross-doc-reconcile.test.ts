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
  rowsComparableForCrossDocReconciliation,
  atomicFieldNonComparableForDocType,
} from "@/lib/cross-doc-reconcile/normalize";
import type { ReconRow } from "@/lib/cross-doc-reconcile/compute-updates";

function recon(rows: ReconRow[]) {
  return computeReconciliationUpdates(rows).updates;
}

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

  test("normalizeFieldValue uses text path for place fields", () => {
    expect(normalizeFieldValue("New  York", "place_of_birth")).toBe("new york");
  });

  test("rowsComparableForCrossDocReconciliation", () => {
    expect(
      rowsComparableForCrossDocReconciliation(
        "current_passport",
        "birth_certificate",
        "date_of_birth",
      ),
    ).toBe(true);
    expect(
      rowsComparableForCrossDocReconciliation(
        "current_passport",
        "address_proof",
        "date_of_birth",
      ),
    ).toBe(false);
    expect(
      rowsComparableForCrossDocReconciliation(
        "birth_certificate",
        "current_passport",
        "place_of_birth",
      ),
    ).toBe(true);
  });

  test("atomicFieldNonComparableForDocType", () => {
    expect(
      atomicFieldNonComparableForDocType(
        "date_of_birth",
        "address_proof",
        "date_of_birth",
      ),
    ).toBe(true);
    expect(
      atomicFieldNonComparableForDocType(
        "date_of_birth",
        "birth_certificate",
        "date_of_birth",
      ),
    ).toBe(false);
  });
});

describe("cross-doc-reconcile constants", () => {
  test("parseAutoReconNote", () => {
    expect(parseAutoReconNote(formatAutoReconNote("confirmed"))).toBe(
      "confirmed",
    );
    expect(parseAutoReconNote(formatAutoReconNote("single_source"))).toBe(
      "single_source",
    );
    expect(
      parseAutoReconNote(formatAutoReconConflictNote("a | b")),
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
    expect(computeReconciliationUpdates([]).updates).toEqual([]);
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
    const u = recon(rows);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({
      id: "a",
      is_flagged: false,
      flag_note: "AUTO_RECON:single_source",
    });
  });

  test("confirmed across passport + birth certificate for date_of_birth", () => {
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
    const u = recon(rows);
    expect(u).toHaveLength(2);
    expect(u.every((x) => x.flag_note === "AUTO_RECON:confirmed")).toBe(true);
    expect(u.every((x) => !x.is_flagged)).toBe(true);
  });

  test("conflict across passport + birth certificate for date_of_birth", () => {
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
    const u = recon(rows);
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
    expect(recon(rows)).toEqual([]);
  });

  test("passport_number is not cross-reconciled against birth certificate document_number", () => {
    const rows: ReconRow[] = [
      row({
        id: "p",
        field_name: "passport_number",
        field_value: "N1234567",
        source_doc_type: "current_passport",
      }),
      row({
        id: "d",
        field_name: "document_number",
        field_value: "N1234567",
        source_doc_type: "birth_certificate",
      }),
    ];
    expect(recon(rows)).toEqual([]);
  });

  test("certificate_number on birth certificate is not reconciled", () => {
    const rows: ReconRow[] = [
      row({
        id: "c1",
        field_name: "certificate_number",
        field_value: "BC-001",
        source_doc_type: "birth_certificate",
      }),
      row({
        id: "c2",
        field_name: "certificate_number",
        field_value: "BC-002",
        source_doc_type: "birth_certificate",
      }),
    ];
    expect(recon(rows)).toEqual([]);
  });

  test("date_of_birth on address_proof is ignored for reconciliation vs passport", () => {
    const rows: ReconRow[] = [
      row({
        id: "p",
        field_name: "date_of_birth",
        field_value: "1990-01-15",
        source_doc_type: "current_passport",
      }),
      row({
        id: "addr",
        field_name: "dob",
        field_value: "1991-06-01",
        source_doc_type: "address_proof",
      }),
    ];
    const { updates, skippedDueToAllowedDocTypes } =
      computeReconciliationUpdates(rows);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("p");
    expect(updates[0].flag_note).toBe("AUTO_RECON:single_source");
    expect(
      skippedDueToAllowedDocTypes.some(
        (s) => s.sourceDocType === "address_proof",
      ),
    ).toBe(true);
  });

  test("address_proof applicant name rows are excluded from reconciliation entirely", () => {
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
        id: "fa",
        field_name: "first_name",
        field_value: "Wrong",
        source_doc_type: "address_proof",
      }),
    ];
    const { updates } = computeReconciliationUpdates(rows);
    expect(updates).toEqual([]);
  });
});
