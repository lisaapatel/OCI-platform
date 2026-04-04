import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "pdfjs-dist", "@napi-rs/canvas", "tesseract.js"],
  // pdf.js fake worker dynamic-import can be missed by tracing; ensure worker ships with standalone/Lambda.
  outputFileTracingIncludes: {
    "/api/documents/compress": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
