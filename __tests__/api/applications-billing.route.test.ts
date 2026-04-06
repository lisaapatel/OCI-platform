/**
 * @jest-environment node
 */

const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { PATCH } from "@/app/api/applications/[id]/billing/route";

describe("PATCH /api/applications/[id]/billing", () => {
  beforeEach(() => {
    mockFrom.mockReturnValue({
      update: mockUpdate,
    });
    mockUpdate.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      single: mockSingle,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("accepts our_cost zero", async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: "app-1",
        app_number: "APP-0001",
        customer_name: "A",
        customer_email: "a@b.c",
        customer_phone: "",
        service_type: "oci_new",
        status: "docs_pending",
        drive_folder_id: "",
        drive_folder_url: "",
        notes: "",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "",
        vfs_tracking_number: null,
        govt_tracking_number: null,
        customer_price: 200,
        our_cost: 0,
        payment_status: "paid",
        payment_method: null,
      },
      error: null,
    } as never);

    const req = new Request("http://localhost/api/applications/app-1/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ our_cost: 0 }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ our_cost: 0 })
    );
  });

  test("rejects non-positive customer_price", async () => {
    const req = new Request("http://localhost/api/applications/x/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_price: 0 }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(400);
  });

  test("updates and returns application", async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: "app-1",
        app_number: "APP-0001",
        customer_name: "A",
        customer_email: "a@b.c",
        customer_phone: "",
        service_type: "oci_new",
        status: "docs_pending",
        drive_folder_id: "",
        drive_folder_url: "",
        notes: "",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "",
        vfs_tracking_number: "VFS1",
        govt_tracking_number: null,
        customer_price: 100,
        our_cost: 40,
        payment_status: "paid",
        payment_method: null,
      },
      error: null,
    } as never);

    const req = new Request("http://localhost/api/applications/app-1/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vfs_tracking_number: "VFS1",
        customer_price: 100,
        our_cost: 40,
        payment_status: "paid",
        payment_method: "zelle",
      }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      application: { customer_price: number | null; payment_status: string };
    };
    expect(json.application.customer_price).toBe(100);
    expect(json.application.payment_status).toBe("paid");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        vfs_tracking_number: "VFS1",
        customer_price: 100,
        our_cost: 40,
        payment_status: "paid",
        payment_method: "zelle",
      })
    );
  });

  test("PATCH accepts oci_file_reference_number", async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: "app-1",
        app_number: "APP-0001",
        customer_name: "A",
        customer_email: "a@b.c",
        customer_phone: "",
        service_type: "oci_new",
        status: "docs_pending",
        drive_folder_id: "",
        drive_folder_url: "",
        notes: "",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "",
        vfs_tracking_number: null,
        govt_tracking_number: null,
        oci_file_reference_number: "OCIUSA2024ABCDEF",
        customer_price: null,
        our_cost: null,
        payment_status: "unpaid",
        payment_method: null,
        billing_government_fees: null,
        billing_government_fees_paid_by: null,
        billing_service_fee: null,
      },
      error: null,
    } as never);

    const req = new Request("http://localhost/api/applications/app-1/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oci_file_reference_number: "OCIUSA2024ABCDEF",
      }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      application: { oci_file_reference_number: string | null };
    };
    expect(json.application.oci_file_reference_number).toBe("OCIUSA2024ABCDEF");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oci_file_reference_number: "OCIUSA2024ABCDEF",
      })
    );
  });

  test("accepts billing government fees and paid_by", async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: "app-1",
        app_number: "APP-0001",
        customer_name: "A",
        customer_email: "a@b.c",
        customer_phone: "",
        service_type: "oci_new",
        status: "docs_pending",
        drive_folder_id: "",
        drive_folder_url: "",
        notes: "",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "",
        vfs_tracking_number: null,
        govt_tracking_number: null,
        customer_price: 500,
        our_cost: null,
        payment_status: "paid",
        payment_method: null,
        billing_government_fees: 250,
        billing_government_fees_paid_by: "company_advanced",
        billing_service_fee: null,
      },
      error: null,
    } as never);

    const req = new Request("http://localhost/api/applications/app-1/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billing_government_fees: 250,
        billing_government_fees_paid_by: "company_advanced",
        billing_service_fee: null,
      }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_government_fees: 250,
        billing_government_fees_paid_by: "company_advanced",
        billing_service_fee: null,
      })
    );
  });

  test("rejects invalid billing_government_fees_paid_by", async () => {
    const req = new Request("http://localhost/api/applications/app-1/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billing_government_fees_paid_by: "nope",
      }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(400);
  });
});
