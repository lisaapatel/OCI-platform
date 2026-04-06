/**
 * @jest-environment node
 */

const supabaseAdminFrom = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => supabaseAdminFrom(...args),
  },
}));

import { PATCH } from "../../app/api/documents/[id]/route";

describe("PATCH /api/documents/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updates parent_passport_father to parent_oci_father and resets extraction", async () => {
    const docsMock = {
      select: jest.fn(),
      update: jest.fn(),
    };

    docsMock.select.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "d1", doc_type: "parent_passport_father" },
          error: null,
        }),
      }),
    });

    docsMock.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "d1",
              doc_type: "parent_oci_father",
              extraction_status: "pending",
            },
            error: null,
          }),
        }),
      }),
    });

    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "documents") return docsMock;
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { service_type: "oci_new" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/documents/d1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_type: "parent_oci_father" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(200);
    expect(docsMock.update).toHaveBeenCalledWith({
      doc_type: "parent_oci_father",
      extraction_status: "pending",
      failure_reason: null,
    });
  });

  test("returns 400 when transition is not an allowed minor parent swap", async () => {
    const docsMock = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: "d1", doc_type: "parent_passport_father" },
            error: null,
          }),
        }),
      }),
      update: jest.fn(),
    };
    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "documents") return docsMock;
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { service_type: "oci_new" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req = new Request("http://localhost/api/documents/d1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_type: "birth_certificate" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(400);
    expect(docsMock.update).not.toHaveBeenCalled();
  });
});
