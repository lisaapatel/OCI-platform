/**
 * @jest-environment node
 */

import {
  formatOciIntakeVariantLabel,
  ociIntakeVariantFromAnswers,
} from "../../lib/oci-intake-ui";

describe("ociIntakeVariantFromAnswers", () => {
  test("existing registration maps to misc_reissue", () => {
    expect(ociIntakeVariantFromAnswers("existing", "")).toBe("misc_reissue");
  });

  test("first-time + prev Indian maps to new_prev_indian", () => {
    expect(
      ociIntakeVariantFromAnswers("first_time", "prev_indian")
    ).toBe("new_prev_indian");
  });

  test("first-time + foreign birth maps to new_foreign_birth", () => {
    expect(
      ociIntakeVariantFromAnswers("first_time", "foreign_birth")
    ).toBe("new_foreign_birth");
  });

  test("incomplete answers return null", () => {
    expect(ociIntakeVariantFromAnswers("", "")).toBeNull();
    expect(ociIntakeVariantFromAnswers("first_time", "")).toBeNull();
  });
});

describe("formatOciIntakeVariantLabel", () => {
  test("returns labels for known variants", () => {
    expect(formatOciIntakeVariantLabel("new_prev_indian")).toContain(
      "Previously Indian"
    );
    expect(formatOciIntakeVariantLabel("new_foreign_birth")).toContain(
      "Foreign national"
    );
    expect(formatOciIntakeVariantLabel("misc_reissue")).toContain("Reissue");
  });

  test("null and undefined return null", () => {
    expect(formatOciIntakeVariantLabel(null)).toBeNull();
    expect(formatOciIntakeVariantLabel(undefined)).toBeNull();
  });
});
