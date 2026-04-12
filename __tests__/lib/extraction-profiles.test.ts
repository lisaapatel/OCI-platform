/**
 * @jest-environment node
 */

import {
  DOC_TYPE_TO_EXTRACTION_PROFILE,
  buildProfileExtractionPromptAppendix,
  filterExtractedByProfile,
  getExtractionProfile,
  resolvePassportProfileId,
} from "../../lib/extraction-profiles";
import { CLAUDE_EXTRACTION_KEY_INSTRUCTIONS } from "../../lib/form-fill-sections";

describe("getExtractionProfile", () => {
  test("maps passport doc types to indian or foreign profiles (defaults)", () => {
    expect(getExtractionProfile("current_passport").id).toBe(
      "foreign_passport_core"
    );
    expect(getExtractionProfile("former_indian_passport").id).toBe(
      "indian_passport_core"
    );
    expect(getExtractionProfile("old_passport").id).toBe(
      "foreign_passport_core"
    );
    expect(getExtractionProfile("parent_passport_father").id).toBe(
      "indian_passport_core"
    );
    expect(getExtractionProfile("parent_passport_mother").id).toBe(
      "indian_passport_core"
    );
    expect(getExtractionProfile("parent_passport").id).toBe(
      "indian_passport_core"
    );
    expect(getExtractionProfile("birth_certificate").id).toBe(
      "birth_certificate_core"
    );
    expect(getExtractionProfile("address_proof").id).toBe(
      "address_proof_core"
    );
    expect(getExtractionProfile("parent_address_proof").id).toBe(
      "address_proof_core"
    );
    expect(getExtractionProfile("applicant_oci_card").id).toBe("oci_card_core");
    expect(getExtractionProfile("parent_oci").id).toBe("oci_card_core");
    expect(getExtractionProfile("parent_oci_father").id).toBe("oci_card_core");
    expect(getExtractionProfile("parent_oci_mother").id).toBe("oci_card_core");
    expect(getExtractionProfile("applicant_photo").id).toBe(
      "photo_signature_skip"
    );
    expect(getExtractionProfile("applicant_signature").id).toBe(
      "photo_signature_skip"
    );
  });

  test("current_passport uses indian profile when service_type is passport_renewal", () => {
    expect(
      getExtractionProfile("current_passport", {
        serviceType: "passport_renewal",
      }).id
    ).toBe("indian_passport_core");
  });

  test("former_indian_passport uses foreign profile for new_foreign_birth variant", () => {
    expect(
      getExtractionProfile("former_indian_passport", {
        ociIntakeVariant: "new_foreign_birth",
      }).id
    ).toBe("foreign_passport_core");
  });

  test("resolvePassportProfileId matches getExtractionProfile for passport types", () => {
    expect(resolvePassportProfileId("current_passport")).toBe(
      "foreign_passport_core"
    );
    expect(
      resolvePassportProfileId("current_passport", {
        serviceType: "passport_renewal",
      })
    ).toBe("indian_passport_core");
    expect(resolvePassportProfileId("former_indian_passport")).toBe(
      "indian_passport_core"
    );
    expect(
      resolvePassportProfileId("former_indian_passport", {
        ociIntakeVariant: "new_foreign_birth",
      })
    ).toBe("foreign_passport_core");
    expect(resolvePassportProfileId("parent_passport_father")).toBe(
      "indian_passport_core"
    );
    expect(resolvePassportProfileId("parent_passport_mother")).toBe(
      "indian_passport_core"
    );
    expect(resolvePassportProfileId("parent_passport")).toBe(
      "indian_passport_core"
    );
  });

  test("unknown doc type uses general_fallback", () => {
    expect(getExtractionProfile("marriage_certificate").id).toBe(
      "general_fallback"
    );
    expect(getExtractionProfile("parent_indian_doc").id).toBe(
      "general_fallback"
    );
    expect(getExtractionProfile("").id).toBe("general_fallback");
  });

  test("passport profiles prefer MRZ first", () => {
    expect(getExtractionProfile("current_passport").preferMrzFirst).toBe(true);
    expect(getExtractionProfile("former_indian_passport").preferMrzFirst).toBe(
      true
    );
    expect(getExtractionProfile("birth_certificate").preferMrzFirst).toBe(
      false
    );
  });

  test("photo skip profile skips AI", () => {
    expect(getExtractionProfile("applicant_photo").skipAiExtraction).toBe(true);
    expect(getExtractionProfile("current_passport").skipAiExtraction).toBe(
      false
    );
  });
});

describe("buildProfileExtractionPromptAppendix", () => {
  test("fallback uses legacy key instructions", () => {
    const p = getExtractionProfile("marriage_certificate");
    const text = buildProfileExtractionPromptAppendix("marriage_certificate", p);
    expect(text).toBe(CLAUDE_EXTRACTION_KEY_INSTRUCTIONS);
  });

  test("narrow profile lists only target keys", () => {
    const p = getExtractionProfile("address_proof");
    const text = buildProfileExtractionPromptAppendix("address_proof", p);
    expect(text).toContain("address_line_1");
    expect(text).toContain("Do not infer");
    expect(text).not.toContain("father_full_name");
  });
});

describe("filterExtractedByProfile", () => {
  test("general_fallback keeps all keys", () => {
    const p = getExtractionProfile("marriage_certificate");
    const raw = { a: "1", b: "2" };
    expect(filterExtractedByProfile(raw, p)).toEqual(raw);
  });

  test("address profile drops unrelated keys", () => {
    const p = getExtractionProfile("address_proof");
    const raw = {
      address_line_1: "1 Main",
      first_name: "oops",
      city: "X",
    };
    expect(filterExtractedByProfile(raw, p)).toEqual({
      address_line_1: "1 Main",
      city: "X",
    });
  });

  test("address profile keeps permanent address keys", () => {
    const p = getExtractionProfile("address_proof");
    const raw = {
      permanent_address_line_1: "Old lane",
      permanent_city: "Y",
      first_name: "nope",
    };
    expect(filterExtractedByProfile(raw, p)).toEqual({
      permanent_address_line_1: "Old lane",
      permanent_city: "Y",
    });
  });

  test("address profile keeps state ID / DL metadata keys", () => {
    const p = getExtractionProfile("us_address_proof");
    const raw = {
      id_document_number: "S0403 43972 55552",
      id_expiry_date: "05-10-2029",
      id_document_holder_name: "SANDHU LAKHBIR KAUR",
      first_name: "nope",
    };
    expect(filterExtractedByProfile(raw, p)).toEqual({
      id_document_number: "S0403 43972 55552",
      id_expiry_date: "05-10-2029",
      id_document_holder_name: "SANDHU LAKHBIR KAUR",
    });
  });

  test("foreign passport profile keeps MRZ overlay keys after merge simulation", () => {
    const p = getExtractionProfile("current_passport");
    const raw = {
      last_name: "Doe",
      passport_number: "N123",
      spouse_name: "Jane",
      extra_noise: "no",
    };
    const out = filterExtractedByProfile(raw, p);
    expect(out.extra_noise).toBeUndefined();
    expect(out.last_name).toBe("Doe");
    expect(out.spouse_name).toBe("Jane");
  });

  test("foreign passport profile drops former_indian keys", () => {
    const p = getExtractionProfile("current_passport");
    const raw = {
      passport_number: "X",
      former_indian_passport_number: "should_drop",
    };
    const out = filterExtractedByProfile(raw, p);
    expect(out.passport_number).toBe("X");
    expect(out.former_indian_passport_number).toBeUndefined();
  });

  test("indian passport profile keeps former_indian keys", () => {
    const p = getExtractionProfile("former_indian_passport");
    const raw = {
      passport_number: "X",
      former_indian_passport_number: "Y",
    };
    const out = filterExtractedByProfile(raw, p);
    expect(out.passport_number).toBe("X");
    expect(out.former_indian_passport_number).toBe("Y");
  });
});

describe("DOC_TYPE_TO_EXTRACTION_PROFILE", () => {
  test("has stable entries for non-passport doc types", () => {
    for (const dt of [
      "birth_certificate",
      "address_proof",
      "applicant_oci_card",
      "parent_oci",
      "parent_oci_father",
      "parent_oci_mother",
    ]) {
      expect(DOC_TYPE_TO_EXTRACTION_PROFILE[dt]).toBeDefined();
    }
  });

  test("passport checklist types are routed via getExtractionProfile, not static map", () => {
    for (const dt of [
      "current_passport",
      "former_indian_passport",
      "old_passport",
    ]) {
      expect(DOC_TYPE_TO_EXTRACTION_PROFILE[dt]).toBeUndefined();
    }
  });
});
