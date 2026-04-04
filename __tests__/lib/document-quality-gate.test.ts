/**
 * @jest-environment node
 */

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import {
  analyzeDocumentQuality,
  formatDocumentQualityHint,
} from "../../lib/document-quality-gate";

describe("analyzeDocumentQuality", () => {
  test("solid white image -> likely_blank and manual_review_recommended", async () => {
    const buf = await sharp({
      create: {
        width: 900,
        height: 900,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    const r = await analyzeDocumentQuality({
      buffer: buf,
      mimeType: "image/jpeg",
      fileName: "white.jpg",
    });
    expect(r.issues).toContain("likely_blank");
    expect(r.status).toBe("manual_review_recommended");
  });

  test("small dimensions -> low_resolution", async () => {
    const buf = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();
    const r = await analyzeDocumentQuality({
      buffer: buf,
      mimeType: "image/jpeg",
      fileName: "small.jpg",
    });
    expect(r.issues).toContain("low_resolution");
    expect(r.status).toBe("warning");
  });

  test("single-page PDF is ok", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const buf = Buffer.from(await pdf.save());
    const r = await analyzeDocumentQuality({
      buffer: buf,
      mimeType: "application/pdf",
      fileName: "one.pdf",
    });
    expect(r.status).toBe("ok");
    expect(r.issues).toEqual([]);
  });

  test("many-page PDF -> pdf_page_count_high", async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 16; i += 1) {
      pdf.addPage();
    }
    const buf = Buffer.from(await pdf.save());
    const r = await analyzeDocumentQuality({
      buffer: buf,
      mimeType: "application/pdf",
      fileName: "big.pdf",
    });
    expect(r.issues).toContain("pdf_page_count_high");
    expect(r.status).toBe("warning");
  });

  test("empty buffer is unprocessable", async () => {
    const r = await analyzeDocumentQuality({
      buffer: Buffer.alloc(0),
      mimeType: "image/jpeg",
    });
    expect(r.status).toBe("unprocessable");
    expect(r.issues).toContain("decode_failed");
  });

  test("unknown mime with no raster/pdf hint returns ok", async () => {
    const r = await analyzeDocumentQuality({
      buffer: Buffer.from("hello"),
      mimeType: "application/octet-stream",
      fileName: "blob.dat",
    });
    expect(r.status).toBe("ok");
  });
});

describe("formatDocumentQualityHint", () => {
  test("summarizes issues", () => {
    const s = formatDocumentQualityHint({
      status: "warning",
      issues: ["low_resolution"],
      details: { analyzedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(s).toMatch(/low resolution/i);
  });

  test("ok returns empty string", () => {
    expect(
      formatDocumentQualityHint({
        status: "ok",
        issues: [],
        details: { analyzedAt: "2026-01-01T00:00:00.000Z" },
      })
    ).toBe("");
  });
});
