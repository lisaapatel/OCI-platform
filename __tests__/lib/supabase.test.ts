/**
 * @jest-environment node
 */

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    auth: {
      getUser: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
  }),
}));

import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");

describe("lib/supabase", () => {
  test("Test 1: Supabase client initializes without throwing", () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../lib/supabase");
    }).not.toThrow();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("../../lib/supabase") as typeof import("../../lib/supabase");
    expect(supabase).toBeDefined();
    expect(supabase).not.toBeNull();
  });

  test("Test 2: Supabase client has expected methods", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("../../lib/supabase") as typeof import("../../lib/supabase");

    expect(typeof supabase.from).toBe("function");
    expect(typeof supabase.auth).toBe("object");
    expect(typeof supabase.auth.getUser).toBe("function");
    expect(typeof supabase.auth.signInWithPassword).toBe("function");
    expect(typeof supabase.auth.signOut).toBe("function");
  });

  test("Test 3: Verify the SQL schema file exists and contains required table names", () => {
    const schemaPath = path.join(projectRoot, "lib", "db-schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("create table applications");
    expect(sql).toContain("archived_at");
    expect(sql).toContain("create table documents");
    expect(sql).toContain("create table extracted_fields");
    expect(sql).toContain("uuid_generate_v4()");
    expect(sql.toLowerCase()).toContain("row level security");
    expect(sql).toContain("generate_app_number");
  });

  test("Test 4: Verify schema contains correct status constraints for applications", () => {
    const schemaPath = path.join(projectRoot, "lib", "db-schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");

    for (const status of [
      "docs_pending",
      "ready_for_review",
      "ready_to_submit",
      "submitted",
      "on_hold",
    ]) {
      expect(sql).toContain(status);
    }

    for (const serviceType of ["oci_new", "oci_renewal", "passport_renewal"]) {
      expect(sql).toContain(serviceType);
    }
  });
});
