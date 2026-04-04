/**
 * @jest-environment node
 */

import {
  mergeMrzOverVision,
  normalizePassportNameSynonyms,
} from "../../lib/passport-mrz-merge";

describe("normalizePassportNameSynonyms", () => {
  test("copies MRZ-aligned first/last into given_name/surname and builds full_name", () => {
    const out: Record<string, string | null> = {
      first_name: "JOHN",
      last_name: "DOE",
      given_name: null,
      surname: null,
      middle_name: null,
      full_name: null,
    };
    normalizePassportNameSynonyms(out);
    expect(out.given_name).toBe("JOHN");
    expect(out.surname).toBe("DOE");
    expect(out.full_name).toBe("JOHN DOE");
  });

  test("includes middle_name in full_name when present", () => {
    const out: Record<string, string | null> = {
      first_name: "JOHN",
      middle_name: "Q",
      last_name: "DOE",
      given_name: null,
      surname: null,
      full_name: null,
    };
    normalizePassportNameSynonyms(out);
    expect(out.full_name).toBe("JOHN Q DOE");
  });

  test("fills first/last from given/surname when MRZ keys missing", () => {
    const out: Record<string, string | null> = {
      first_name: null,
      last_name: null,
      given_name: "PRIYA",
      surname: "SHARMA",
      full_name: null,
    };
    normalizePassportNameSynonyms(out);
    expect(out.first_name).toBe("PRIYA");
    expect(out.last_name).toBe("SHARMA");
    expect(out.full_name).toBe("PRIYA SHARMA");
  });

  test("does not overwrite existing full_name", () => {
    const out: Record<string, string | null> = {
      first_name: "A",
      last_name: "B",
      full_name: "Custom",
    };
    normalizePassportNameSynonyms(out);
    expect(out.full_name).toBe("Custom");
  });
});

describe("mergeMrzOverVision", () => {
  test("normalizes synonyms after MRZ overlay", () => {
    const vision: Record<string, string | null> = {
      first_name: null,
      last_name: null,
      given_name: null,
      surname: null,
      full_name: null,
      passport_number: null,
    };
    const mrz: Record<string, string> = {
      first_name: "JANE",
      last_name: "ROE",
      passport_number: "X123",
      nationality: "USA",
      date_of_birth: "1990-01-01",
      gender: "F",
      expiry_date: "2030-01-01",
    };
    const merged = mergeMrzOverVision(vision, mrz);
    expect(merged.first_name).toBe("JANE");
    expect(merged.given_name).toBe("JANE");
    expect(merged.last_name).toBe("ROE");
    expect(merged.surname).toBe("ROE");
    expect(merged.full_name).toBe("JANE ROE");
  });

  test("normalizes when MRZ is null", () => {
    const vision: Record<string, string | null> = {
      first_name: null,
      last_name: null,
      given_name: "ALEX",
      surname: "KIM",
      full_name: null,
    };
    const merged = mergeMrzOverVision(vision, null);
    expect(merged.first_name).toBe("ALEX");
    expect(merged.last_name).toBe("KIM");
    expect(merged.full_name).toBe("ALEX KIM");
  });

  test("when MRZ has both names, drops vision applicant-name fields before overlay", () => {
    const vision: Record<string, string | null> = {
      first_name: "WRONGFATHER",
      last_name: "WRONG",
      given_name: "WRONGGIVEN",
      surname: "WRONGSUR",
      full_name: "WRONG FULL",
      middle_name: null,
      date_of_birth: "1995-05-05",
    };
    const mrz: Record<string, string> = {
      first_name: "JANE",
      last_name: "ROE",
      passport_number: "N1",
      nationality: "IND",
      date_of_birth: "1990-01-01",
      gender: "F",
      expiry_date: "2030-01-01",
    };
    const merged = mergeMrzOverVision(vision, mrz);
    expect(merged.first_name).toBe("JANE");
    expect(merged.last_name).toBe("ROE");
    expect(merged.given_name).toBe("JANE");
    expect(merged.surname).toBe("ROE");
    expect(merged.date_of_birth).toBe("1990-01-01");
  });

  test("when MRZ lacks full name pair, keeps vision names and overlays other MRZ fields", () => {
    const vision: Record<string, string | null> = {
      first_name: "KEEPME",
      last_name: "KEEPLAST",
      given_name: null,
      surname: null,
      full_name: null,
      date_of_birth: null,
    };
    const mrz: Record<string, string> = {
      first_name: "ONLYFIRST",
      last_name: "",
      passport_number: "P9",
      nationality: "USA",
      date_of_birth: "1988-08-08",
      gender: "M",
      expiry_date: "2028-08-08",
    };
    const merged = mergeMrzOverVision(vision, mrz);
    expect(merged.first_name).toBe("ONLYFIRST");
    expect(merged.last_name).toBe("KEEPLAST");
    expect(merged.passport_number).toBe("P9");
  });

  test("clears date_of_birth when year is more than one year in the future", () => {
    const vision: Record<string, string | null> = {
      first_name: "A",
      last_name: "B",
      date_of_birth: "2099-03-15",
    };
    const merged = mergeMrzOverVision(vision, null);
    expect(merged.date_of_birth).toBeNull();
  });

  test("clears impossible DOB after MRZ merge", () => {
    const vision: Record<string, string | null> = {
      first_name: "A",
      last_name: "B",
      date_of_birth: "2010-01-01",
    };
    const mrz: Record<string, string> = {
      first_name: "A",
      last_name: "B",
      passport_number: "X",
      nationality: "USA",
      date_of_birth: "2099-06-01",
      gender: "M",
      expiry_date: "2030-01-01",
    };
    const merged = mergeMrzOverVision(vision, mrz);
    expect(merged.date_of_birth).toBeNull();
  });
});
