import { getChecklistForApplication } from "../../lib/application-checklist";
import {
  composeOciChecklist,
  composeOciChecklistCore,
} from "../../lib/oci-checklist-compose";
import { OCI_NEW_CHECKLIST } from "../../lib/oci-new-checklist";

const BASE_LEN = OCI_NEW_CHECKLIST.length;
/** Base rows after removing address + marriage + generic parent slots for OCI minors */
const OCI_MINOR_BASE_LEN = BASE_LEN - 4;

describe("composeOciChecklist", () => {
  test("null variant and not minor matches base OCI checklist only", () => {
    const list = composeOciChecklist({
      oci_intake_variant: null,
      is_minor: false,
    });
    expect(list).toHaveLength(BASE_LEN);
    expect(list.map((i) => i.doc_type)).toEqual(
      OCI_NEW_CHECKLIST.map((i) => i.doc_type)
    );
  });

  test("undefined variant behaves like null", () => {
    const list = composeOciChecklist({
      oci_intake_variant: undefined,
      is_minor: false,
    });
    expect(list).toHaveLength(BASE_LEN);
  });

  test("new_foreign_birth keeps former_indian_passport with neutral label and adds no variant rows", () => {
    const list = composeOciChecklist({
      oci_intake_variant: "new_foreign_birth",
      is_minor: false,
    });
    expect(list).toHaveLength(BASE_LEN);
    const former = list.find((i) => i.doc_type === "former_indian_passport");
    expect(former?.label).toBe("Applicant's Former Passport (if any)");
    expect(former?.optionalNote).toContain("another country");
  });

  test("new_prev_indian appends advisory relinquishment row (not required)", () => {
    const list = composeOciChecklist({
      oci_intake_variant: "new_prev_indian",
      is_minor: false,
    });
    expect(list).toHaveLength(BASE_LEN + 1);
    const extra = list[BASE_LEN];
    expect(extra?.doc_type).toBe("indian_citizenship_relinquishment");
    expect(extra?.required).toBe(false);
    expect(extra?.optionalNote).toBeTruthy();
  });

  test("misc_reissue appends advisory applicant OCI card row (not required)", () => {
    const list = composeOciChecklist({
      oci_intake_variant: "misc_reissue",
      is_minor: false,
    });
    expect(list).toHaveLength(BASE_LEN + 1);
    const extra = list[BASE_LEN];
    expect(extra?.doc_type).toBe("applicant_oci_card");
    expect(extra?.required).toBe(false);
  });

  test("minor appends parent checklist after filtered base (and after variant extra)", () => {
    const list = composeOciChecklist({
      oci_intake_variant: "new_prev_indian",
      is_minor: true,
    });
    expect(list).toHaveLength(OCI_MINOR_BASE_LEN + 1 + 3);
    expect(list[OCI_MINOR_BASE_LEN]?.doc_type).toBe(
      "indian_citizenship_relinquishment"
    );
    expect(list[OCI_MINOR_BASE_LEN + 1]?.doc_type).toBe(
      "parent_passport_father"
    );
    expect(list[OCI_MINOR_BASE_LEN + 2]?.doc_type).toBe(
      "parent_passport_mother"
    );
    expect(list[OCI_MINOR_BASE_LEN + 3]?.doc_type).toBe(
      "parent_address_proof"
    );
    const types = list.map((i) => i.doc_type);
    expect(types).not.toContain("address_proof");
    expect(types).not.toContain("marriage_certificate");
    expect(types).not.toContain("parent_passport");
    expect(types).not.toContain("parent_oci");
  });

  test("new_foreign_birth minor has filtered base plus parent rows only", () => {
    const list = composeOciChecklist({
      oci_intake_variant: "new_foreign_birth",
      is_minor: true,
    });
    expect(list).toHaveLength(OCI_MINOR_BASE_LEN + 3);
    expect(list.map((i) => i.doc_type)).toContain("former_indian_passport");
    expect(list[OCI_MINOR_BASE_LEN]?.doc_type).toBe("parent_passport_father");
  });

  test("new_prev_indian and misc_reissue keep former_indian_passport in base", () => {
    expect(
      composeOciChecklist({
        oci_intake_variant: "new_prev_indian",
        is_minor: false,
      }).map((i) => i.doc_type)
    ).toContain("former_indian_passport");
    expect(
      composeOciChecklist({
        oci_intake_variant: "misc_reissue",
        is_minor: false,
      }).map((i) => i.doc_type)
    ).toContain("former_indian_passport");
  });
});

describe("composeOciChecklistCore", () => {
  test("minor core has no parent appendix; full list is core plus three parent rows", () => {
    const core = composeOciChecklistCore({
      oci_intake_variant: "misc_reissue",
      is_minor: true,
    });
    const full = composeOciChecklist({
      oci_intake_variant: "misc_reissue",
      is_minor: true,
    });
    expect(core).toHaveLength(OCI_MINOR_BASE_LEN + 1);
    expect(full).toHaveLength(core.length + 3);
    expect(full.slice(0, core.length)).toEqual(core);
    expect(full[core.length]?.doc_type).toBe("parent_passport_father");
  });

  test("non-minor core equals full compose", () => {
    const core = composeOciChecklistCore({
      oci_intake_variant: null,
      is_minor: false,
    });
    const full = composeOciChecklist({
      oci_intake_variant: null,
      is_minor: false,
    });
    expect(core).toEqual(full);
  });
});

describe("getChecklistForApplication (OCI composition)", () => {
  test("oci_new with variant uses composeOciChecklist", () => {
    const list = getChecklistForApplication({
      service_type: "oci_new",
      is_minor: false,
      oci_intake_variant: "misc_reissue",
    });
    expect(list.map((i) => i.doc_type)).toContain("applicant_oci_card");
  });

  test("passport_renewal ignores oci_intake_variant", () => {
    const list = getChecklistForApplication({
      service_type: "passport_renewal",
      is_minor: false,
      oci_intake_variant: "misc_reissue",
    });
    expect(list.map((i) => i.doc_type)).not.toContain("applicant_oci_card");
  });

  test("passport_renewal minor includes parent checklist items", () => {
    const list = getChecklistForApplication({
      service_type: "passport_renewal",
      is_minor: true,
      oci_intake_variant: null,
    });
    expect(list.map((i) => i.doc_type)).toContain("parent_address_proof");
  });

  test("oci minor omits adult-only base rows but keeps minor parent slots", () => {
    const list = getChecklistForApplication({
      service_type: "oci_new",
      is_minor: true,
      oci_intake_variant: null,
    });
    const types = list.map((i) => i.doc_type);
    expect(types).not.toContain("address_proof");
    expect(types).not.toContain("marriage_certificate");
    expect(types).not.toContain("parent_passport");
    expect(types).not.toContain("parent_oci");
    expect(types).toContain("parent_passport_father");
    expect(types).toContain("parent_address_proof");
  });

  test("oci new_foreign_birth keeps former_indian_passport with neutral copy for minor and adult", () => {
    for (const is_minor of [false, true]) {
      const list = getChecklistForApplication({
        service_type: "oci_renewal",
        is_minor,
        oci_intake_variant: "new_foreign_birth",
      });
      const former = list.find((i) => i.doc_type === "former_indian_passport");
      expect(former?.label).toBe("Applicant's Former Passport (if any)");
    }
  });
});
