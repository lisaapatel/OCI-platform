import {
  allUploadedChecklistPdfsPortalReady,
  documentPdfReadyForPortal,
} from "../../lib/portal-readiness";

describe("documentPdfReadyForPortal", () => {
  test("true when original under limit", () => {
    expect(
      documentPdfReadyForPortal({
        size_bytes: 100 * 1024,
        compressed_size_bytes: null,
      })
    ).toBe(true);
  });

  test("true when original over but compressed under limit", () => {
    expect(
      documentPdfReadyForPortal({
        size_bytes: 2 * 1024 * 1024,
        compressed_size_bytes: 400 * 1024,
      })
    ).toBe(true);
  });

  test("false when both over limit", () => {
    expect(
      documentPdfReadyForPortal({
        size_bytes: 2 * 1024 * 1024,
        compressed_size_bytes: 2 * 1024 * 1024,
      })
    ).toBe(false);
  });
});

describe("allUploadedChecklistPdfsPortalReady", () => {
  test("false when portal list empty", () => {
    expect(
      allUploadedChecklistPdfsPortalReady(
        [{ id: "a", doc_type: "current_passport" }],
        []
      )
    ).toBe(false);
  });

  test("false when required PDF missing", () => {
    expect(
      allUploadedChecklistPdfsPortalReady(
        [{ id: "d1", doc_type: "current_passport" }],
        [{ id: "d1", ready_for_portal: true }]
      )
    ).toBe(false);
  });

  const requiredPdfRows = [
    { id: "a", doc_type: "current_passport" },
    { id: "b", doc_type: "old_passport" },
    { id: "c", doc_type: "birth_certificate" },
    { id: "d", doc_type: "address_proof" },
    { id: "e", doc_type: "parent_indian_doc" },
  ];
  const allReadyPortal = requiredPdfRows.map((r) => ({
    id: r.id,
    ready_for_portal: true,
  }));

  test("true when all required PDFs uploaded and ready", () => {
    expect(
      allUploadedChecklistPdfsPortalReady(requiredPdfRows, allReadyPortal)
    ).toBe(true);
  });

  test("false when one uploaded PDF not ready", () => {
    const portal = allReadyPortal.map((p, i) =>
      i === 0 ? { ...p, ready_for_portal: false } : p
    );
    expect(
      allUploadedChecklistPdfsPortalReady(requiredPdfRows, portal)
    ).toBe(false);
  });
});
