/**
 * @jest-environment node
 */

import sharp from "sharp";

import {
  GOVT_IMAGE_MAX_BYTES,
  validateGovtImage,
} from "../../lib/govt-photo-signature";

describe("govt-photo-signature validateGovtImage", () => {
  test("accepts valid square JPEG photo under 30KB", async () => {
    const buf = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: "#ccc",
      },
    })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    expect(buf.length).toBeLessThanOrEqual(GOVT_IMAGE_MAX_BYTES);
    const r = await validateGovtImage(buf, "photo");
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  test("flags non-square photo", async () => {
    const buf = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: "#ccc",
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const r = await validateGovtImage(buf, "photo");
    expect(r.valid).toBe(false);
    expect(r.issues.some((x) => /square/i.test(x))).toBe(true);
  });
});
