import {
  isAutoReconConflictNote,
  parseConflictSourcesFromFlagNote,
} from "../../lib/review-conflict-display";

describe("parseConflictSourcesFromFlagNote", () => {
  test("splits AUTO_RECON conflict body on pipes", () => {
    expect(
      parseConflictSourcesFromFlagNote(
        "AUTO_RECON:conflict|Current Passport: A | Birth Certificate: B"
      )
    ).toEqual(["Current Passport: A", "Birth Certificate: B"]);
  });

  test("returns single segment when no pipe", () => {
    expect(
      parseConflictSourcesFromFlagNote("AUTO_RECON:conflict|only one")
    ).toEqual(["only one"]);
  });

  test("non-auto note returns one line", () => {
    expect(parseConflictSourcesFromFlagNote("manual note")).toEqual([
      "manual note",
    ]);
  });

  test("empty yields empty array", () => {
    expect(parseConflictSourcesFromFlagNote("")).toEqual([]);
    expect(parseConflictSourcesFromFlagNote(null)).toEqual([]);
  });
});

describe("isAutoReconConflictNote", () => {
  test("detects conflict prefix", () => {
    expect(isAutoReconConflictNote("AUTO_RECON:conflict|x")).toBe(true);
    expect(isAutoReconConflictNote("AUTO_RECON:confirmed")).toBe(false);
  });
});
