/**
 * @jest-environment node
 */

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        getAccessToken: jest.fn().mockResolvedValue({ token: "fake-token" }),
      })),
    },
    drive: jest.fn().mockReturnValue({
      files: {
        create: jest.fn().mockResolvedValue({
          data: {
            id: "fake-file-id-123",
            webViewLink:
              "https://drive.google.com/file/d/fake-file-id-123/view",
          },
        }),
        get: jest.fn().mockResolvedValue({
          data: Buffer.from("fake-file-content"),
        }),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      permissions: {
        create: jest.fn().mockResolvedValue({}),
      },
    }),
  },
}));

function setGoogleEnv() {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "test-root-folder-id";
}

describe("lib/google-drive", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    setGoogleEnv();
  });

  test("Test 1: getGoogleDriveClient returns a client object", async () => {
    const { getGoogleDriveClient } = await import("../../lib/google-drive");
    const drive = getGoogleDriveClient();

    expect(drive).toBeTruthy();
    expect((drive as any).files).toBeTruthy();
  });

  test("Test 2: createApplicationFolder returns id and url", async () => {
    const { createApplicationFolder } = await import("../../lib/google-drive");

    const result = await createApplicationFolder("APP-0001", "Priya Sharma");
    expect(result).toEqual({
      id: "fake-file-id-123",
      url: expect.stringContaining("drive.google.com"),
    });

    const { google } = jest.requireMock("googleapis") as any;
    const driveMock = (google.drive as jest.Mock).mock.results[0]?.value as any;
    expect(driveMock.files.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "APP-0001 — Priya Sharma",
          parents: ["test-root-folder-id"],
          mimeType: "application/vnd.google-apps.folder",
        }),
      })
    );
  });

  test("Test 3: uploadFileToDrive returns id and url", async () => {
    const { uploadFileToDrive } = await import("../../lib/google-drive");

    const result = await uploadFileToDrive(
      Buffer.from("test content"),
      "passport.pdf",
      "application/pdf",
      "test-folder-id"
    );

    expect(result.id).toBeTruthy();
    expect(result.url).toEqual(expect.stringContaining("drive.google.com"));
  });

  test("Test 4: deleteFile calls the Drive delete API", async () => {
    const { deleteFile } = await import("../../lib/google-drive");
    await deleteFile("test-file-id");

    const { google } = jest.requireMock("googleapis") as any;
    const driveMock = (google.drive as jest.Mock).mock.results[0]?.value as any;
    expect(driveMock.files.delete).toHaveBeenCalledWith({
      fileId: "test-file-id",
    });
  });

  test("Test 5: getFileAsBase64 returns a base64 string", async () => {
    const payload = Buffer.from("fake-drive-bytes");
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
      arrayBuffer: async () =>
        payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength
        ),
    } as Response);

    try {
      const { getFileAsBase64 } = await import("../../lib/google-drive");
      const b64 = await getFileAsBase64("test-file-id");
      expect(typeof b64).toBe("string");
      expect(b64).toBe(payload.toString("base64"));
      expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "googleapis.com/drive/v3/files/test-file-id"
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Bearer /),
          }),
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

