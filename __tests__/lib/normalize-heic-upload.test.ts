import sharp from "sharp";

import {
  ApplicantImageNormalizeError,
  normalizeHeicApplicantImageUpload,
} from "@/lib/normalize-heic-upload";

describe("normalizeHeicApplicantImageUpload", () => {
  test("passes through JPEG unchanged (same buffer reference)", async () => {
    const buffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const out = await normalizeHeicApplicantImageUpload({
      buffer,
      mimeType: "image/jpeg",
      clientFileName: "photo.jpg",
    });

    expect(out.buffer).toBe(buffer);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.clientFileName).toBe("photo.jpg");
  });

  test("passes through when MIME is generic but filename is not .heic", async () => {
    const buffer = Buffer.from("x");
    const out = await normalizeHeicApplicantImageUpload({
      buffer,
      mimeType: "application/octet-stream",
      clientFileName: "scan.jpeg",
    });
    expect(out.buffer).toBe(buffer);
    expect(out.mimeType).toBe("application/octet-stream");
  });

  test("detects HEIC by filename extension and attempts conversion", async () => {
    const garbage = Buffer.from("not a real heic file");
    await expect(
      normalizeHeicApplicantImageUpload({
        buffer: garbage,
        mimeType: "application/octet-stream",
        clientFileName: "IMG_0001.heic",
      })
    ).rejects.toThrow(ApplicantImageNormalizeError);

    await expect(
      normalizeHeicApplicantImageUpload({
        buffer: garbage,
        mimeType: "application/octet-stream",
        clientFileName: "IMG_0001.heic",
      })
    ).rejects.toThrow(/Could not read image; try exporting as JPEG/i);
  });

  test("detects HEIC by MIME", async () => {
    const garbage = Buffer.from("x");
    await expect(
      normalizeHeicApplicantImageUpload({
        buffer: garbage,
        mimeType: "image/heic",
        clientFileName: "blob",
      })
    ).rejects.toThrow(ApplicantImageNormalizeError);
  });

  test("detects HEIF by MIME", async () => {
    const garbage = Buffer.from("x");
    await expect(
      normalizeHeicApplicantImageUpload({
        buffer: garbage,
        mimeType: "image/heif",
        clientFileName: "x",
      })
    ).rejects.toThrow(ApplicantImageNormalizeError);
  });
});
