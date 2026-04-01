/**
 * @jest-environment node
 */

import {
  classifyForCompression,
  compressImageForPortal,
  isPdfBuffer,
} from "../../lib/document-compress";
import { PORTAL_MAX_BYTES, PORTAL_MAX_KB } from "../../lib/portal-constants";
import sharp from "sharp";

describe("portal-constants", () => {
  test("500KB portal limit", () => {
    expect(PORTAL_MAX_KB).toBe(500);
    expect(PORTAL_MAX_BYTES).toBe(500 * 1024);
  });
});

describe("document-compress helpers", () => {
  test("isPdfBuffer detects PDF magic", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.4\n"))).toBe(true);
    expect(isPdfBuffer(Buffer.from("hello"))).toBe(false);
  });

  test("classifyForCompression", () => {
    const pdfBuf = Buffer.from("%PDF-1.4\n");
    expect(classifyForCompression(pdfBuf, "application/octet-stream")).toBe(
      "pdf"
    );
    expect(
      classifyForCompression(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg")
    ).toBe("image");
    expect(classifyForCompression(Buffer.from("x"), "text/plain")).toBe(
      "unknown"
    );
  });
});

describe("compressImageForPortal", () => {
  test("returns JPEG within limit for small input (fast path)", async () => {
    const small = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 30, g: 120, b: 200 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const out = await compressImageForPortal(small, PORTAL_MAX_BYTES);
    expect(out.length).toBeLessThanOrEqual(PORTAL_MAX_BYTES);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });

  test("shrinks a striped synthetic image under a tight target", async () => {
    const w = 480;
    const h = 480;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      const band = y % 24 < 12 ? [220, 220, 210] : [40, 45, 55];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        raw[i] = band[0];
        raw[i + 1] = band[1];
        raw[i + 2] = band[2];
      }
    }
    const large = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();

    expect(large.length).toBeGreaterThan(8 * 1024);

    const target = 6 * 1024;
    const out = await compressImageForPortal(large, target);
    expect(out.length).toBeLessThanOrEqual(target);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });
});
