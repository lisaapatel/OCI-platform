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

  test("Test 2: Fetches all pending documents for the application", async () => {
    const eq2 = jest.fn().mockResolvedValue({
      data: [
        {
          id: "d1",
          drive_file_id: "file-1",
          doc_type: "current_passport",
        },
      ],
      error: null,
    });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const selectStar = jest.fn().mockReturnValue({ eq: eq1 });

    const headChain2 = jest.fn().mockResolvedValue({ count: 0, error: null });
    const headChain1 = jest.fn().mockReturnValue({ eq: headChain2 });
    const headSelect = jest.fn().mockReturnValue({ eq: headChain1 });

    const headSingleEq = jest.fn().mockResolvedValue({ count: 1, error: null });
    const headSelectSingle = jest.fn().mockReturnValue({ eq: headSingleEq });

    const documentsSelect = jest.fn((cols: string, opts?: { head?: boolean }) => {
      if (opts?.head) {
        return cols === "id" ? headSelectSingle() : headSelect();
      }
      return selectStar();
    });

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
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {};
    });

    getFileAsBase64.mockResolvedValue("YmFzZTY0");
    extractFieldsFromDocument.mockResolvedValue({ name: "A" });

    await POST(req({ application_id: "app-1" }));

    expect(documentsSelect).toHaveBeenCalledWith("*");
    expect(eq1).toHaveBeenCalledWith("application_id", "app-1");
    expect(eq2).toHaveBeenCalledWith("extraction_status", "pending");
  });

  test("Test 3: Calls Claude API once per document", async () => {
    const docs = [
      { id: "d1", drive_file_id: "f1", doc_type: "a" },
      { id: "d2", drive_file_id: "f2", doc_type: "b" },
    ];
    const eq2 = jest.fn().mockResolvedValue({ data: docs, error: null });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const selectStar = jest.fn().mockReturnValue({ eq: eq1 });

    const headChain2 = jest.fn().mockResolvedValue({ count: 0, error: null });
    const headChain1 = jest.fn().mockReturnValue({ eq: headChain2 });
    const headSelect = jest.fn().mockReturnValue({ eq: headChain1 });
    const headSingleEq = jest.fn().mockResolvedValue({ count: 2, error: null });
    const headSelectSingle = jest.fn().mockReturnValue({ eq: headSingleEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: jest.fn((cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return cols === "id" ? headSelectSingle() : headSelect();
            }
            return selectStar();
          }),
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
    const eq2 = jest.fn().mockResolvedValue({
      data: [{ id: "d1", drive_file_id: "f1", doc_type: "passport" }],
      error: null,
    });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const selectStar = jest.fn().mockReturnValue({ eq: eq1 });
    const headChain2 = jest.fn().mockResolvedValue({ count: 0, error: null });
    const headChain1 = jest.fn().mockReturnValue({ eq: headChain2 });
    const headSelect = jest.fn().mockReturnValue({ eq: headChain1 });
    const headSingleEq = jest.fn().mockResolvedValue({ count: 1, error: null });
    const headSelectSingle = jest.fn().mockReturnValue({ eq: headSingleEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: jest.fn((cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return cols === "id" ? headSelectSingle() : headSelect();
            }
            return selectStar();
          }),
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
    const eq2 = jest.fn().mockResolvedValue({
      data: [{ id: "d1", drive_file_id: "f1", doc_type: "p" }],
      error: null,
    });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const selectStar = jest.fn().mockReturnValue({ eq: eq1 });
    const headChain2 = jest.fn().mockResolvedValue({ count: 0, error: null });
    const headChain1 = jest.fn().mockReturnValue({ eq: headChain2 });
    const headSelect = jest.fn().mockReturnValue({ eq: headChain1 });
    const headSingleEq = jest.fn().mockResolvedValue({ count: 1, error: null });
    const headSelectSingle = jest.fn().mockReturnValue({ eq: headSingleEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: jest.fn((cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return cols === "id" ? headSelectSingle() : headSelect();
            }
            return selectStar();
          }),
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
    const eq2 = jest.fn().mockResolvedValue({
      data: [{ id: "d1", drive_file_id: "f1", doc_type: "p" }],
      error: null,
    });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const selectStar = jest.fn().mockReturnValue({ eq: eq1 });
    const headChain2 = jest.fn().mockResolvedValue({ count: 0, error: null });
    const headChain1 = jest.fn().mockReturnValue({ eq: headChain2 });
    const headSelect = jest.fn().mockReturnValue({ eq: headChain1 });
    const headSingleEq = jest.fn().mockResolvedValue({ count: 1, error: null });
    const headSelectSingle = jest.fn().mockReturnValue({ eq: headSingleEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: jest.fn((cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return cols === "id" ? headSelectSingle() : headSelect();
            }
            return selectStar();
          }),
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
      { id: "d1", drive_file_id: "f1", doc_type: "a" },
      { id: "d2", drive_file_id: "f2", doc_type: "b" },
    ];
    const eq2 = jest.fn().mockResolvedValue({ data: docs, error: null });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const selectStar = jest.fn().mockReturnValue({ eq: eq1 });
    const headChain2 = jest.fn().mockResolvedValue({ count: 0, error: null });
    const headChain1 = jest.fn().mockReturnValue({ eq: headChain2 });
    const headSelect = jest.fn().mockReturnValue({ eq: headChain1 });
    const headSingleEq = jest.fn().mockResolvedValue({ count: 2, error: null });
    const headSelectSingle = jest.fn().mockReturnValue({ eq: headSingleEq });

    fromMock.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: jest.fn((cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return cols === "id" ? headSelectSingle() : headSelect();
            }
            return selectStar();
          }),
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
