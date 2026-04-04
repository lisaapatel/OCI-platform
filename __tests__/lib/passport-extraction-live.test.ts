/**
 * @jest-environment node
 *
 * Live integration test for passport extraction.
 * Runs the real MRZ + vision pipeline against an actual passport file.
 *
 * Usage:
 *   PASSPORT_FILE=/path/to/passport.pdf \
 *   PASSPORT_DOC_TYPE=parent_passport_father \
 *   ANTHROPIC_API_KEY=sk-... \
 *   npx jest --testPathPatterns passport-extraction-live --verbose
 *
 * PASSPORT_DOC_TYPE options:
 *   current_passport          (child's US/foreign passport)
 *   parent_passport_father    (Indian passport → indian_passport_core)
 *   parent_passport_mother    (Indian passport → indian_passport_core)
 *
 * Optional — set expected values to get PASS/FAIL per field:
 *   EXPECT_FIRST_NAME=HARSHAL
 *   EXPECT_LAST_NAME=SHAH
 *   EXPECT_DOB=1981-11-09
 *   EXPECT_PASSPORT_NUMBER=M6594754
 */

import fs from "fs";
import path from "path";

// Load .env.local so ANTHROPIC_API_KEY is available without dotenv dependency
const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

import { extractFieldsFromDocument } from "../../lib/claude";

const PASSPORT_FILE = process.env.PASSPORT_FILE ?? "";
const DOC_TYPE = process.env.PASSPORT_DOC_TYPE ?? "parent_passport_father";

// Optional expected values for assertion
const EXPECT: Record<string, string | undefined> = {
  first_name: process.env.EXPECT_FIRST_NAME,
  last_name: process.env.EXPECT_LAST_NAME,
  date_of_birth: process.env.EXPECT_DOB,
  passport_number: process.env.EXPECT_PASSPORT_NUMBER,
};

// Long timeout — real Claude + MRZ calls take 10–80s
const TIMEOUT = 120_000;

describe("passport extraction (live)", () => {
  test(
    `extracts fields from ${PASSPORT_FILE || "(no file set)"} as ${DOC_TYPE}`,
    async () => {
      if (!PASSPORT_FILE) {
        console.warn(
          "PASSPORT_FILE env var not set — skipping. Set it to a PDF or image path."
        );
        return;
      }

      const filePath = path.resolve(PASSPORT_FILE);
      expect(fs.existsSync(filePath)).toBe(true);

      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString("base64");
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

      console.log(`\nFile: ${filePath}`);
      console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
      console.log(`MIME: ${mimeType}`);
      console.log(`doc_type: ${DOC_TYPE}\n`);

      const result = await extractFieldsFromDocument({
        base64,
        mimeType,
        docType: DOC_TYPE,
        passportRouting: { serviceType: "oci_new" },
      });

      console.log("=== Extracted fields ===");
      for (const [k, v] of Object.entries(result)) {
        if (v !== null) console.log(`  ${k}: ${v}`);
      }

      console.log("\n=== Null fields ===");
      for (const [k, v] of Object.entries(result)) {
        if (v === null) console.log(`  ${k}: null`);
      }

      // Check expected values if provided
      const failures: string[] = [];
      for (const [field, expected] of Object.entries(EXPECT)) {
        if (!expected) continue;
        const got = result[field] ?? "(null)";
        const pass =
          got.toLowerCase().includes(expected.toLowerCase()) ||
          expected.toLowerCase().includes(got.toLowerCase());
        if (pass) {
          console.log(`\n✓ ${field}: got "${got}" (expected "${expected}")`);
        } else {
          console.log(`\n✗ ${field}: got "${got}" (expected "${expected}")`);
          failures.push(`${field}: got "${got}", expected "${expected}"`);
        }
      }

      if (failures.length > 0) {
        throw new Error(`Field mismatches:\n  ${failures.join("\n  ")}`);
      }
    },
    TIMEOUT
  );
});
