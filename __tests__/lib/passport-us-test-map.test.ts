/**
 * @jest-environment node
 */

import {
  extractedRowsToFieldMap,
  mapToDs82,
} from "@/lib/passport-us-test/map-ds82";

describe("passport-us-test map-ds82", () => {
  test("extractedRowsToFieldMap normalizes keys", () => {
    expect(
      extractedRowsToFieldMap([
        { field_name: "First_Name", field_value: "Ann" },
        { field_name: "first_name", field_value: "ignored" },
      ])
    ).toEqual({ first_name: "Ann" });
  });

  test("mapToDs82 uses synonyms", () => {
    const m = mapToDs82({
      given_name: "Jane",
      surname: "Smith",
      dob: "1990-03-01",
      passport_no: "X123",
      birth_place: "NYC",
    });
    expect(m).toEqual({
      FirstName: "Jane",
      LastName: "Smith",
      DateOfBirth: "1990-03-01",
      PassportNumber: "X123",
      PlaceOfBirth: "NYC",
    });
  });

  test("mapToDs82 tolerates missing keys", () => {
    expect(mapToDs82({})).toEqual({
      FirstName: "",
      LastName: "",
      DateOfBirth: "",
      PassportNumber: "",
      PlaceOfBirth: "",
    });
  });
});
