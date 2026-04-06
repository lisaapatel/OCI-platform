/**
 * @jest-environment node
 */

const createApplicationFolder = jest.fn();
const supabaseAdminFrom = jest.fn();

jest.mock("@/lib/google-drive", () => ({
  createApplicationFolder: (...args: unknown[]) =>
    createApplicationFolder(...args),
}));

jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => supabaseAdminFrom(...args),
  },
}));

import { POST } from "../../app/api/applications/route";

describe("POST /api/applications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("creates application and returns id", async () => {
    createApplicationFolder.mockResolvedValue({
      id: "drive-folder-id",
      url: "https://drive.google.com/drive/folders/drive-folder-id",
    });

    const insertPayloads: unknown[] = [];

    let insertStep = 0;
    supabaseAdminFrom.mockImplementation(() => {
      insertStep += 1;
      if (insertStep === 1) {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest
                .fn()
                .mockResolvedValue({ data: [{ app_number: "APP-0002" }], error: null }),
            }),
          }),
        };
      }
      if (insertStep === 2) {
        return {
          insert: jest.fn((payload: unknown) => {
            insertPayloads.push(payload);
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: "new-app-id" },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (insertStep === 3) {
        return {
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Priya Sharma",
        customer_email: "priya@example.com",
        customer_phone: "555-1234",
        service_type: "oci_new",
        notes: "test",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "new-app-id" });

    expect(createApplicationFolder).toHaveBeenCalledWith("APP-0003", "Priya Sharma");
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({
        app_number: "APP-0003",
        customer_name: "Priya Sharma",
        service_type: "oci_new",
        status: "docs_pending",
        drive_folder_id: "",
        drive_folder_url: "",
      })
    );
  });

  test("returns 400 when full name missing", async () => {
    supabaseAdminFrom.mockReturnValue({
      select: jest.fn(),
      insert: jest.fn(),
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "   ",
        service_type: "oci_new",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/full name is required/i);
  });

  test("still creates application when Drive folder creation fails", async () => {
    createApplicationFolder.mockRejectedValue(new Error("drive down"));

    const insertPayloads: unknown[] = [];
    let step = 0;
    supabaseAdminFrom.mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (step === 2) {
        return {
          insert: jest.fn((payload: unknown) => {
            insertPayloads.push(payload);
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: "app-without-drive" },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Raj Patel",
        service_type: "oci_renewal",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "app-without-drive" });
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({
        customer_name: "Raj Patel",
        drive_folder_id: "",
        drive_folder_url: "",
        app_number: "APP-0001",
      })
    );
  });

  test("inserts is_minor true when provided", async () => {
    createApplicationFolder.mockResolvedValue({
      id: "drive-folder-id",
      url: "https://drive.google.com/drive/folders/drive-folder-id",
    });

    const insertPayloads: unknown[] = [];
    let step = 0;
    supabaseAdminFrom.mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (step === 2) {
        return {
          insert: jest.fn((payload: unknown) => {
            insertPayloads.push(payload);
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: "minor-app" },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (step === 3) {
        return {
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Kid User",
        service_type: "passport_renewal",
        is_minor: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({ is_minor: true })
    );
  });

  test("inserts oci_intake_variant when provided for oci_new", async () => {
    createApplicationFolder.mockResolvedValue({
      id: "drive-folder-id",
      url: "https://drive.google.com/drive/folders/drive-folder-id",
    });

    const insertPayloads: unknown[] = [];
    let step = 0;
    supabaseAdminFrom.mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (step === 2) {
        return {
          insert: jest.fn((payload: unknown) => {
            insertPayloads.push(payload);
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: "variant-app" },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (step === 3) {
        return {
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "A B",
        service_type: "oci_new",
        oci_intake_variant: "new_foreign_birth",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({
        oci_intake_variant: "new_foreign_birth",
      })
    );
  });

  test("returns 400 for invalid oci_intake_variant string", async () => {
    supabaseAdminFrom.mockReturnValue({
      select: jest.fn(),
      insert: jest.fn(),
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "X",
        service_type: "oci_new",
        oci_intake_variant: "not_a_variant",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/oci_intake_variant must be one of/i);
  });

  test("returns 400 when oci_intake_variant set for non-OCI service", async () => {
    supabaseAdminFrom.mockReturnValue({
      select: jest.fn(),
      insert: jest.fn(),
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "X",
        service_type: "passport_renewal",
        oci_intake_variant: "misc_reissue",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/only valid for OCI applications/i);
  });

  test("uses max app_number + 1, not row count (gaps after deletes)", async () => {
    createApplicationFolder.mockResolvedValue({
      id: "drive-folder-id",
      url: "https://drive.google.com/drive/folders/drive-folder-id",
    });

    const insertPayloads: unknown[] = [];
    let step = 0;
    supabaseAdminFrom.mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ app_number: "APP-0005" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (step === 2) {
        return {
          insert: jest.fn((payload: unknown) => {
            insertPayloads.push(payload);
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: "gap-app" },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (step === 3) {
        return {
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Gap Test",
        service_type: "oci_new",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({ app_number: "APP-0006" })
    );
  });

  test("returns 400 when is_minor is not boolean", async () => {
    supabaseAdminFrom.mockReturnValue({
      select: jest.fn(),
      insert: jest.fn(),
    });

    const req = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "X",
        service_type: "oci_new",
        is_minor: "yes",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/is_minor must be a boolean/i);
  });
});
