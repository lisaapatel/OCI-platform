/**
 * @jest-environment node
 */

const supabaseAdminFrom = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => supabaseAdminFrom(...args),
  },
}));

import { PATCH } from "../../app/api/applications/[id]/route";

function applicationsTableMock(handlers: {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
}) {
  const maybeSingle =
    handlers.maybeSingle ??
    (async () => ({
      data: { service_type: "oci_new", is_minor: false },
      error: null,
    }));
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockImplementation(maybeSingle),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockImplementation(
        async () => ({ error: null }) as { error: unknown }
      ),
    }),
  };
}

describe("PATCH /api/applications/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updates is_minor only", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const appMock = {
      select: jest.fn(),
      update: jest.fn().mockReturnValue({ eq: updateEq }),
    };
    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "applications") return appMock;
      return {};
    });

    const req = new Request("http://localhost/api/applications/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_minor: true }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(200);
    expect(appMock.update).toHaveBeenCalledWith({ is_minor: true });
    expect(updateEq).toHaveBeenCalledWith("id", "x");
  });

  test("returns 400 when ready_to_submit and minor parent docs missing", async () => {
    const appMock = applicationsTableMock({
      maybeSingle: async () => ({
        data: { service_type: "passport_renewal", is_minor: true },
        error: null,
      }),
    });
    const docsMock = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ doc_type: "parent_passport_father" }],
          error: null,
        }),
      }),
    };

    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "applications") return appMock;
      if (table === "documents") return docsMock;
      return {};
    });

    const req = new Request("http://localhost/api/applications/app1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_submit" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "app1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/minor applicants need/i);
    expect(appMock.update).not.toHaveBeenCalled();
  });

  test("allows ready_to_submit for minor when parent passport and address present", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const appMock = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { service_type: "oci_new", is_minor: true },
            error: null,
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({ eq: updateEq }),
    };
    const docsMock = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [
            { doc_type: "parent_passport_mother" },
            { doc_type: "parent_address_proof" },
          ],
          error: null,
        }),
      }),
    };

    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "applications") return appMock;
      if (table === "documents") return docsMock;
      return {};
    });

    const req = new Request("http://localhost/api/applications/app1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_submit" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "app1" }) });
    expect(res.status).toBe(200);
    expect(updateEq).toHaveBeenCalledWith("id", "app1");
  });

  test("OCI non-minor still requires legacy parent doc for ready_to_submit", async () => {
    const appMock = applicationsTableMock({
      maybeSingle: async () => ({
        data: { service_type: "oci_new", is_minor: false },
        error: null,
      }),
    });
    const docsMock = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ doc_type: "current_passport" }],
          error: null,
        }),
      }),
    };

    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "applications") return appMock;
      if (table === "documents") return docsMock;
      return {};
    });

    const req = new Request("http://localhost/api/applications/app1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_submit" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "app1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/OCI applications require/i);
    expect(appMock.update).not.toHaveBeenCalled();
  });
});
