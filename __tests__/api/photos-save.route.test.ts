/**
 * @jest-environment node
 */

import { POST } from "@/app/api/photos/save/route";

/** Minimal JPEG bytes (tiny); only used for body shape in validation tests. */
function tinyJpegBase64(): string {
  return "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=";
}

describe("POST /api/photos/save", () => {
  const prevRoot = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  afterEach(() => {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = prevRoot;
  });

  test("rejects invalid category", async () => {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "root-1";
    const req = new Request("http://localhost/api/photos/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: tinyJpegBase64(),
        image_type: "photo",
        category: "nope",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

});
