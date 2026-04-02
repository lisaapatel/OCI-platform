/**
 * @jest-environment node
 */

import sharp from "sharp";

const findOrCreateChildFolder = jest.fn();
const uploadFileToDrive = jest.fn();

jest.mock("@/lib/google-drive", () => ({
  findOrCreateChildFolder: (...args: unknown[]) =>
    findOrCreateChildFolder(...args),
  getDriveFileMetadata: jest.fn(),
  getFileAsBase64: jest.fn(),
  uploadFileToDrive: (...args: unknown[]) => uploadFileToDrive(...args),
}));

const supabaseAdminFrom = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => supabaseAdminFrom(...args),
  },
}));

import { POST } from "../../app/api/documents/fix-image/route";

describe("POST /api/documents/fix-image (client crop signature)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findOrCreateChildFolder.mockResolvedValue("fixed-folder-id");
    uploadFileToDrive.mockResolvedValue({
      id: "fixed-file-id",
      url: "https://example.com/fixed.jpg",
    });
  });

  test("accepts image_type='signature' and updates applicant_signature fixed metadata", async () => {
    const appDriveFolder = "drive-app-folder";
    const docRow = {
      id: "doc-sig",
      doc_type: "applicant_signature",
      file_name: "sig.jpg",
      drive_file_id: "drive-sig",
    };

    const applicationsApi = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: "app-1", drive_folder_id: appDriveFolder },
            error: null,
          }),
        }),
      }),
    };

    const maybeSingle = jest.fn().mockResolvedValue({
      data: docRow,
      error: null,
    });
    const afterThirdEq = { maybeSingle };
    const afterSecondEq = {
      eq: jest.fn().mockReturnValue(afterThirdEq),
    };
    const afterFirstEq = {
      eq: jest.fn().mockReturnValue(afterSecondEq),
    };

    const docsApi = {
      select: jest.fn().mockReturnValue(afterFirstEq),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    };

    supabaseAdminFrom.mockImplementation((table: string) => {
      if (table === "applications") return applicationsApi as any;
      if (table === "documents") return docsApi as any;
      throw new Error(`Unexpected table: ${table}`);
    });

    const buf = await sharp({
      create: {
        width: 600,
        height: 200,
        channels: 3,
        background: "#cccccc",
      },
    })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();

    const req = new Request("http://localhost/api/documents/fix-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: "app-1",
        document_id: docRow.id,
        image_base64: buf.toString("base64"),
        image_type: "signature",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const resBody = (await res.json()) as { ok: boolean };
    expect(resBody.ok).toBe(true);

    expect(findOrCreateChildFolder).toHaveBeenCalledWith(
      appDriveFolder,
      "Fixed"
    );
    expect(uploadFileToDrive).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(String),
      "image/jpeg",
      "fixed-folder-id"
    );
  });
});

