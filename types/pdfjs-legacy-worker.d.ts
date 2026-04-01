declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  /** pdf.js worker entry; registered on `globalThis.pdfjsWorker` for Node/Lambda. */
  export const WorkerMessageHandler: unknown;
}
