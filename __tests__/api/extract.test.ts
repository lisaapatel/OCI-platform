/**
 * @jest-environment node
 */

const getFileAsBase64 = jest.fn();
const extractFieldsFromDocument = jest.fn();
const fromMock = jest.fn();

jest.mock("@/lib/google-drive", () => ({
  getFileAsBase64: (...args: unknown[]) => getFileAsBase64(...args),
}));

jest.mock("@/lib/claude", () => ({
  extractFieldsFromDocument: (...args: unknown[]) =>
    extractFieldsFromDocument(...args),
}));

jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => fromMock(table),
  },
}));

jest.mock("@/lib/cross-doc-reconcile/reconcile-application", () => ({
  reconcileApplication: jest.fn().mockResolvedValue({ ok: true, fields: [] }),
}));

import { POST } from "../../app/api/extract/all/route";

function mockExtractedFieldsDelete() {
  return {
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/extract/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/extract/all", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  test("Test 1: POST /api/extract/all returns 400 if application_id is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  test("Test 2: Fetches all documents for the application and processes pending only", async () => {
    const docsEq = jest.fn().mockResolvedValue({
      data: [
        {
          id: "d1",
          drive_file_id: "file-1",
          doc_type: "current_passport",
          extraction_status: "pending",
        },
      ],
      error: null,
    });
    const documentsSelect = jest.fn().mockReturnValue({ eq: docsEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: documentsSelect,
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "extracted_fields") {
        return {
          ...mockExtractedFieldsDelete(),
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: { service_type: "oci_new" }, error: null }),
            }),
          }),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64.mockResolvedValue("YmFzZTY0");
    extractFieldsFromDocument.mockResolvedValue({ name: "A" });

    const res = await POST(req({ application_id: "app-1" }));
    const body = (await res.json()) as {
      skipped_not_uploaded?: { doc_type: string }[];
      document_results?: { status: string }[];
    };

    expect(documentsSelect).toHaveBeenCalledWith("*");
    expect(docsEq).toHaveBeenCalledWith("application_id", "app-1");
    expect(body.skipped_not_uploaded?.length).toBeGreaterThan(0);
    expect(body.document_results?.some((r) => r.status === "extracted")).toBe(true);
  });

  test("Test 3: Calls Claude API once per document", async () => {
    const docs = [
      {
        id: "d1",
        drive_file_id: "f1",
        doc_type: "a",
        extraction_status: "pending",
      },
      {
        id: "d2",
        drive_file_id: "f2",
        doc_type: "b",
        extraction_status: "pending",
      },
    ];
    const docsEq = jest.fn().mockResolvedValue({ data: docs, error: null });
    const documentsSelect = jest.fn().mockReturnValue({ eq: docsEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: documentsSelect,
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "extracted_fields") {
        return {
          ...mockExtractedFieldsDelete(),
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: { service_type: "oci_new" }, error: null }),
            }),
          }),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64.mockResolvedValue("QQ==");
    extractFieldsFromDocument.mockResolvedValue({ x: "1" });

    await POST(req({ application_id: "app-1" }));

    expect(extractFieldsFromDocument).toHaveBeenCalledTimes(2);
  });

  test("Test 4: Saves extracted fields to Supabase extracted_fields table", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const docsEq = jest.fn().mockResolvedValue({
      data: [
        {
          id: "d1",
          drive_file_id: "f1",
          doc_type: "passport",
          extraction_status: "pending",
        },
      ],
      error: null,
    });
    const documentsSelect = jest.fn().mockReturnValue({ eq: docsEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: documentsSelect,
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "extracted_fields") {
        return { ...mockExtractedFieldsDelete(), insert };
      }
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: { service_type: "oci_new" }, error: null }),
            }),
          }),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64.mockResolvedValue("QQ==");
    extractFieldsFromDocument.mockResolvedValue({ field_a: "v" });

    await POST(req({ application_id: "app-1" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        application_id: "app-1",
        field_name: "field_a",
        field_value: "v",
        source_doc_type: "passport",
      })
    );
  });

  test("Test 5: Updates document extraction_status to done after processing", async () => {
    const update = jest.fn(() => ({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }));
    const docsEq = jest.fn().mockResolvedValue({
      data: [
        {
          id: "d1",
          drive_file_id: "f1",
          doc_type: "p",
          extraction_status: "pending",
        },
      ],
      error: null,
    });
    const documentsSelect = jest.fn().mockReturnValue({ eq: docsEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: documentsSelect,
          update,
        };
      }
      if (table === "extracted_fields") {
        return {
          ...mockExtractedFieldsDelete(),
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: { service_type: "oci_new" }, error: null }),
            }),
          }),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64.mockResolvedValue("QQ==");
    extractFieldsFromDocument.mockResolvedValue({});

    await POST(req({ application_id: "app-1" }));

    expect(update).toHaveBeenCalledWith({ extraction_status: "processing" });
    expect(update).toHaveBeenCalledWith({ extraction_status: "done" });
  });

  test("Test 6: If Claude returns null for a field, it still saves the field with null value", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const docsEq = jest.fn().mockResolvedValue({
      data: [
        {
          id: "d1",
          drive_file_id: "f1",
          doc_type: "p",
          extraction_status: "pending",
        },
      ],
      error: null,
    });
    const documentsSelect = jest.fn().mockReturnValue({ eq: docsEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: documentsSelect,
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "extracted_fields") {
        return { ...mockExtractedFieldsDelete(), insert };
      }
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: { service_type: "oci_new" }, error: null }),
            }),
          }),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64.mockResolvedValue("QQ==");
    extractFieldsFromDocument.mockResolvedValue({ maybe_null: null });

    await POST(req({ application_id: "app-1" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        field_name: "maybe_null",
        field_value: null,
      })
    );
  });

  test("Test 7: If Claude API fails for one document, marks that doc as failed and continues others", async () => {
    const update = jest.fn(() => ({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }));
    const docs = [
      {
        id: "d1",
        drive_file_id: "f1",
        doc_type: "a",
        extraction_status: "pending",
      },
      {
        id: "d2",
        drive_file_id: "f2",
        doc_type: "b",
        extraction_status: "pending",
      },
    ];
    const docsEq = jest.fn().mockResolvedValue({ data: docs, error: null });
    const documentsSelect = jest.fn().mockReturnValue({ eq: docsEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: documentsSelect,
          update,
        };
      }
      if (table === "extracted_fields") {
        return {
          ...mockExtractedFieldsDelete(),
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "applications") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: { service_type: "oci_new" }, error: null }),
            }),
          }),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64
      .mockRejectedValueOnce(new Error("drive fail"))
      .mockResolvedValueOnce("QQ==");
    extractFieldsFromDocument.mockResolvedValue({ ok: "1" });

    await POST(req({ application_id: "app-1" }));

    expect(update).toHaveBeenCalledWith({ extraction_status: "failed" });
    expect(extractFieldsFromDocument).toHaveBeenCalledTimes(1);
  });
});
