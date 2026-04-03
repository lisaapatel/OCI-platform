/**
 * @jest-environment node
 */

import fs from "node:fs";
import path from "node:path";

import type { Application, Document, ExtractedField } from "../../lib/types";

const projectRoot = path.resolve(__dirname, "../..");

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() =>
  T extends B ? 1 : 2
  ? true
  : false;
type Assert<T extends true> = T;

type Keys<T> = keyof T;
type HasKeys<T, K extends PropertyKey> = Exclude<K, Keys<T>> extends never
  ? true
  : false;

describe("project structure", () => {
  test("Test 1: Verify TypeScript types are correctly defined", () => {
    // Compile-time assertions: if these are wrong, the test suite fails to compile.
    type _AppHasFields = Assert<
      HasKeys<
        Application,
        | "id"
        | "app_number"
        | "customer_name"
        | "customer_email"
        | "customer_phone"
        | "service_type"
        | "status"
        | "drive_folder_id"
        | "drive_folder_url"
        | "notes"
        | "created_at"
        | "created_by"
        | "is_minor"
        | "oci_intake_variant"
      >
    >;

    type _ServiceTypeAllowed = Assert<
      Equals<
        Application["service_type"],
        | "oci_new"
        | "oci_renewal"
        | "passport_renewal"
        | "passport_us_renewal_test"
      >
    >;

    type _StatusAllowed = Assert<
      Equals<
        Application["status"],
        | "docs_pending"
        | "ready_for_review"
        | "ready_to_submit"
        | "submitted"
        | "on_hold"
      >
    >;

    type _DocHasFields = Assert<
      HasKeys<
        Document,
        | "id"
        | "application_id"
        | "doc_type"
        | "file_name"
        | "drive_file_id"
        | "drive_view_url"
        | "extraction_status"
        | "uploaded_at"
      >
    >;

    type _ExtractionStatusAllowed = Assert<
      Equals<Document["extraction_status"], "pending" | "processing" | "done" | "failed">
    >;

    type _ExtractedFieldHasFields = Assert<
      HasKeys<
        ExtractedField,
        | "id"
        | "application_id"
        | "field_name"
        | "field_value"
        | "source_doc_type"
        | "is_flagged"
        | "flag_note"
        | "reviewed_by"
        | "reviewed_at"
      >
    >;

    expect(true).toBe(true);
  });

  test("Test 2: Verify environment variable placeholders exist", () => {
    const envPath = path.join(projectRoot, ".env.local");
    const content = fs.readFileSync(envPath, "utf8");

    const keys = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REFRESH_TOKEN",
      "GOOGLE_DRIVE_ROOT_FOLDER_ID",
      "ANTHROPIC_API_KEY",
    ] as const;

    for (const key of keys) {
      expect(content).toMatch(new RegExp(`^${key}=`, "m"));
    }
  });

  test("Test 3: Verify required files exist", () => {
    const required = [
      "lib/types.ts",
      "lib/supabase.ts",
      "lib/google-drive.ts",
      "lib/claude.ts",
      "app/(main)/dashboard/page.tsx",
      "app/(main)/applications/new/page.tsx",
      "app/login/page.tsx",
      ".env.local",
    ];

    for (const rel of required) {
      const full = path.join(projectRoot, rel);
      expect(fs.existsSync(full)).toBe(true);
    }
  });
});

