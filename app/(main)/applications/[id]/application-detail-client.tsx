"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

import { coerceExtractionStatus } from "@/lib/document-utils";
import { labelForFailureReason } from "@/lib/extraction-failure-reasons";
import {
  OCI_NEW_CHECKLIST,
  OCI_NEW_REQUIRED_COUNT,
  shouldSkipAiExtraction,
} from "@/lib/oci-new-checklist";
import { PORTAL_MAX_BYTES, PORTAL_MAX_KB } from "@/lib/portal-constants";
import type { Application, Document, ExtractSingleResultBody } from "@/lib/types";

function normalizeDocumentFromApi(row: Record<string, unknown>): Document {
  return {
    id: String(row.id),
    application_id: String(row.application_id),
    doc_type: String(row.doc_type ?? ""),
    file_name: String(row.file_name ?? ""),
    drive_file_id: String(row.drive_file_id ?? ""),
    drive_view_url: String(row.drive_view_url ?? ""),
    extraction_status: coerceExtractionStatus(row.extraction_status),
    failure_reason:
      row.failure_reason == null || row.failure_reason === ""
        ? null
        : String(row.failure_reason),
    uploaded_at: String(row.uploaded_at ?? ""),
    compressed_drive_file_id:
      row.compressed_drive_file_id == null ||
      row.compressed_drive_file_id === ""
        ? null
        : String(row.compressed_drive_file_id),
    compressed_drive_url:
      row.compressed_drive_url == null || row.compressed_drive_url === ""
        ? null
        : String(row.compressed_drive_url),
    compressed_size_bytes:
      row.compressed_size_bytes == null || row.compressed_size_bytes === ""
        ? null
        : Number(row.compressed_size_bytes),
  };
}

type ServiceType = Application["service_type"];
type Status = Application["status"];

type PortalPrepDoc = {
  id: string;
  file_name: string | null;
  drive_file_id: string | null;
  drive_view_url: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  meta_error: string | null;
  ready_for_portal: boolean;
  compressed_drive_file_id?: string | null;
  compressed_drive_url?: string | null;
  compressed_size_bytes?: number | null;
};

function formatKb(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function portalNeedsCompress(row: PortalPrepDoc): boolean {
  if (!row.drive_file_id || row.size_bytes == null) return false;
  if (row.size_bytes <= PORTAL_MAX_BYTES) return false;
  if (
    row.compressed_size_bytes != null &&
    row.compressed_size_bytes <= PORTAL_MAX_BYTES
  )
    return false;
  return true;
}

function ServiceTypeBadge({ serviceType }: { serviceType: ServiceType }) {
  const label =
    serviceType === "oci_new"
      ? "OCI New"
      : serviceType === "oci_renewal"
        ? "OCI Renewal"
        : "Passport Renewal";
  return (
    <span className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#eff6ff] px-2.5 py-1 text-xs font-medium text-[#1e3a5f]">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const { label, className } =
    status === "docs_pending"
      ? {
          label: "Docs Pending",
          className: "bg-gray-100 text-gray-600 ring-gray-200",
        }
      : status === "ready_for_review"
        ? {
            label: "Ready for Review",
            className: "bg-yellow-100 text-yellow-700 ring-yellow-200",
          }
        : status === "ready_to_submit"
          ? {
              label: "Ready to Submit",
              className: "bg-blue-100 text-blue-700 ring-blue-200",
            }
          : status === "submitted"
            ? {
                label: "Submitted",
                className: "bg-green-100 text-green-700 ring-green-200",
              }
            : { label: "On Hold", className: "bg-red-100 text-red-600 ring-red-200" };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors duration-150",
        className
      )}
    >
      {label}
    </span>
  );
}

type Props = {
  application: Application;
  initialDocuments: Document[];
};

export function ApplicationDetailClient({
  application: initialApp,
  initialDocuments,
}: Props) {
  const router = useRouter();
  const [application, setApplication] = useState(initialApp);
  const [documents, setDocuments] = useState(initialDocuments);
  const [notesDraft, setNotesDraft] = useState(initialApp.notes ?? "");
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {}
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{
    message: string;
    step: number | null;
    stepTotal: number;
    docIndex: number;
    docTotal: number;
  } | null>(null);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [portalPrep, setPortalPrep] = useState<{
    documents: PortalPrepDoc[];
    summary: { ready: number; total: number };
  } | null>(null);
  const [portalPrepLoading, setPortalPrepLoading] = useState(false);
  const [compressingDriveIds, setCompressingDriveIds] = useState<
    Record<string, boolean>
  >({});
  const [compressAllRunning, setCompressAllRunning] = useState(false);

  const docByType = useMemo(() => {
    const m = new Map<string, Document>();
    for (const d of documents) {
      m.set(d.doc_type, d);
    }
    return m;
  }, [documents]);

  const requiredUploaded = useMemo(() => {
    let n = 0;
    for (const item of OCI_NEW_CHECKLIST) {
      if (!item.required) continue;
      if (docByType.has(item.doc_type)) n += 1;
    }
    return n;
  }, [docByType]);

  const showDocumentChecklist =
    application.service_type === "oci_new" ||
    application.service_type === "oci_renewal";

  const allRequiredUploaded =
    showDocumentChecklist && requiredUploaded >= OCI_NEW_REQUIRED_COUNT;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const loadDocuments = useCallback(async (): Promise<Document[]> => {
    const listRes = await fetch(
      `/api/documents?application_id=${encodeURIComponent(application.id)}`
    );
    if (!listRes.ok) {
      throw new Error("Failed to reload documents.");
    }
    const list = (await listRes.json()) as {
      documents?: Record<string, unknown>[];
    };
    return (list.documents ?? []).map(normalizeDocumentFromApi);
  }, [application.id]);

  const loadPortalPrep = useCallback(async () => {
    if (!application.id) return;
    setPortalPrepLoading(true);
    try {
      const res = await fetch(
        `/api/documents/portal-prep?application_id=${encodeURIComponent(application.id)}`
      );
      const data = (await res.json()) as {
        error?: string;
        documents?: PortalPrepDoc[];
        summary?: { ready: number; total: number };
      };
      if (!res.ok) {
        setPortalPrep(null);
        console.error("portal-prep failed:", data.error);
        return;
      }
      setPortalPrep({
        documents: data.documents ?? [],
        summary: data.summary ?? { ready: 0, total: 0 },
      });
    } finally {
      setPortalPrepLoading(false);
    }
  }, [application.id]);

  useEffect(() => {
    if (documents.length === 0) {
      setPortalPrep(null);
      return;
    }
    void loadPortalPrep();
  }, [documents, loadPortalPrep]);

  const compressPortalFile = useCallback(
    async (driveFileId: string) => {
      if (!driveFileId) return;
      setPatchError(null);
      setCompressingDriveIds((p) => ({ ...p, [driveFileId]: true }));
      try {
        const res = await fetch("/api/documents/compress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            application_id: application.id,
            drive_file_id: driveFileId,
            target_size_kb: 450,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Compression failed");
        }
        const list = await loadDocuments();
        setDocuments(list);
        await loadPortalPrep();
      } catch (e) {
        setPatchError(e instanceof Error ? e.message : String(e));
      } finally {
        setCompressingDriveIds((p) => {
          const next = { ...p };
          delete next[driveFileId];
          return next;
        });
      }
    },
    [application.id, loadDocuments, loadPortalPrep]
  );

  const compressAllOversized = useCallback(async () => {
    if (!portalPrep?.documents.length) return;
    const targets = portalPrep.documents.filter(portalNeedsCompress);
    if (!targets.length) return;
    setCompressAllRunning(true);
    setPatchError(null);
    try {
      for (const d of targets) {
        if (!d.drive_file_id) continue;
        await compressPortalFile(d.drive_file_id);
      }
    } finally {
      setCompressAllRunning(false);
    }
  }, [portalPrep, compressPortalFile]);

  const extractSingleStreaming = useCallback(
    async (
      documentId: string,
      documentIndex: number,
      documentTotal: number,
      onProgress: (p: {
        message: string;
        step: number | null;
        stepTotal: number;
        docIndex: number;
        docTotal: number;
      }) => void
    ): Promise<ExtractSingleResultBody> => {
      const res = await fetch("/api/extract/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: application.id,
          document_id: documentId,
          stream: true,
          document_index: documentIndex,
          document_total: documentTotal,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* keep raw */
        }
        throw new Error(msg);
      }

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("ndjson") || !res.body) {
        const j = (await res.json()) as Record<string, unknown>;
        if (j.ok === false && typeof j.error === "string") {
          throw new Error(j.error);
        }
        return j as unknown as ExtractSingleResultBody;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastResult: ExtractSingleResultBody | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const evt = JSON.parse(trimmed) as
            | {
                type: "doc_start";
                message: string;
                documentIndex: number;
                documentTotal: number;
              }
            | {
                type: "progress";
                message: string;
                step: number;
                totalSteps: number;
                documentIndex: number;
                documentTotal: number;
              }
            | ({ type: "result" } & Record<string, unknown>);

          if (evt.type === "doc_start") {
            onProgress({
              message: evt.message,
              step: null,
              stepTotal: 4,
              docIndex: evt.documentIndex,
              docTotal: evt.documentTotal,
            });
          }
          if (evt.type === "progress" && "step" in evt) {
            onProgress({
              message: evt.message,
              step: evt.step,
              stepTotal: evt.totalSteps ?? 4,
              docIndex: evt.documentIndex,
              docTotal: evt.documentTotal,
            });
          }
          if (evt.type === "result") {
            const { type: _t, ...rest } = evt;
            lastResult = rest as ExtractSingleResultBody;
          }
        }
      }

      if (!lastResult) {
        throw new Error("No extraction result from server");
      }
      return lastResult;
    },
    [application.id]
  );

  async function patchApplication(body: { status?: Status; notes?: string }) {
    setPatchError(null);
    const res = await fetch(`/api/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPatchError(
        typeof data.error === "string" ? data.error : "Failed to save."
      );
      return false;
    }
    if (body.status !== undefined) {
      setApplication((a) => ({ ...a, status: body.status! }));
    }
    if (body.notes !== undefined) {
      setApplication((a) => ({ ...a, notes: body.notes! }));
    }
    refresh();
    return true;
  }

  async function onNotesBlur() {
    if (notesDraft === (application.notes ?? "")) return;
    await patchApplication({ notes: notesDraft });
  }

  async function processDocuments() {
    setPatchError(null);
    setSkipNotice(null);
    setIsProcessing(true);
    setExtractionProgress(null);

    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    try {
      const fresh = await loadDocuments();
      setDocuments(fresh);

      const byType = new Map(fresh.map((d) => [d.doc_type, d]));
      const checklistDocs = OCI_NEW_CHECKLIST.map((i) => byType.get(i.doc_type)).filter(
        (d): d is Document => Boolean(d)
      );

      const alreadyDone = checklistDocs.filter((d) => d.extraction_status === "done");
      if (alreadyDone.length > 0) {
        setSkipNotice(
          `Skipping ${alreadyDone.length} already extracted doc${alreadyDone.length === 1 ? "" : "s"}`
        );
      }

      const toProcess = checklistDocs.filter((d) => d.extraction_status === "pending");

      if (toProcess.length === 0) {
        if (checklistDocs.length === 0) {
          setIsProcessing(false);
          setExtractionProgress(null);
          alert("No documents to process.");
          return;
        }
        const hasFailed = checklistDocs.some((d) => d.extraction_status === "failed");
        if (hasFailed) {
          setPatchError(
            "No pending documents. Retry failed items with ↺ Retry on each card, or continue to review with the fields you have."
          );
        } else {
          setSkipNotice((prev) =>
            prev ??
            "All uploaded documents are already extracted. Continuing to review."
          );
        }
        await patchApplication({ status: "ready_for_review" });
        router.push(`/applications/${application.id}/review`);
        return;
      }

      const total = toProcess.length;
      let failureCount = 0;

      for (let i = 0; i < total; i++) {
        const doc = toProcess[i]!;
        setExtractingDocId(doc.id);
        try {
          const result = await extractSingleStreaming(
            doc.id,
            i + 1,
            total,
            (p) => setExtractionProgress(p)
          );
          if (result.status === "failed") failureCount += 1;
        } catch (err) {
          failureCount += 1;
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Extraction request error:", msg);
        }

        try {
          const updated = await loadDocuments();
          setDocuments(updated);
        } catch (e) {
          console.error(e);
        }
      }

      setExtractingDocId(null);
      setExtractionProgress(null);

      if (failureCount > 0) {
        setPatchError(
          `${failureCount} document${failureCount === 1 ? "" : "s"} failed extraction. Use ↺ Retry on each card.`
        );
      }

      await patchApplication({ status: "ready_for_review" });
      router.push(`/applications/${application.id}/review`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPatchError(msg);
      alert(`Extraction failed: ${msg}`);
    } finally {
      setIsProcessing(false);
      setExtractingDocId(null);
      setExtractionProgress(null);
    }
  }

  async function retryExtractionForDoc(doc: Document) {
    setPatchError(null);
    setExtractingDocId(doc.id);
    setExtractionProgress({
      message: "Retrying extraction…",
      step: null,
      stepTotal: 4,
      docIndex: 1,
      docTotal: 1,
    });
    try {
      await extractSingleStreaming(doc.id, 1, 1, (p) => setExtractionProgress(p));
      const updated = await loadDocuments();
      setDocuments(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPatchError(msg);
    } finally {
      setExtractingDocId(null);
      setExtractionProgress(null);
    }
  }

  async function uploadFile(docType: string, file: File) {
    setUploadingDocType(docType);
    setPatchError(null);
    setUploadProgress((p) => ({ ...p, [docType]: 0 }));
    try {
      const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadSessionId = `${Date.now()}_${application.id}`;
      let uploadUrl = "";
      let finished = false;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const fd = new FormData();
        fd.set("application_id", application.id);
        fd.set("doc_type", docType);
        fd.set("file_name", file.name);
        fd.set("mime_type", file.type || "application/octet-stream");
        fd.set("chunk_index", String(i));
        fd.set("total_chunks", String(totalChunks));
        fd.set("total_size", String(file.size));
        fd.set("chunk_size", String(CHUNK_SIZE));
        fd.set("upload_session_id", uploadSessionId);
        if (uploadUrl) fd.set("upload_url", uploadUrl);
        fd.set("chunk", chunkBlob, file.name);

        const res = await fetch("/api/documents/chunk", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          upload_url?: string;
          document?: Document;
          uploaded_chunks?: number;
          total_chunks?: number;
        };
        if (!res.ok) {
          setPatchError(typeof data.error === "string" ? data.error : "Upload failed.");
          return;
        }

        if (data.upload_url) uploadUrl = data.upload_url;
        const uploadedChunks = data.uploaded_chunks ?? i + 1;
        setUploadProgress((p) => ({
          ...p,
          [docType]: Math.min(1, uploadedChunks / totalChunks),
        }));

        if (data.document && uploadedChunks === totalChunks) {
          setDocuments((prev) => [
            ...prev.filter((d) => d.doc_type !== docType),
            normalizeDocumentFromApi(
              data.document as unknown as Record<string, unknown>
            ),
          ]);
          finished = true;
        }
      }

      // Ensure UI reflects new doc immediately (server + client state).
      if (finished) {
        const listRes = await fetch(
          `/api/documents?application_id=${encodeURIComponent(application.id)}`
        );
        if (listRes.ok) {
          const list = (await listRes.json()) as {
            documents?: Record<string, unknown>[];
          };
          if (list.documents) {
            setDocuments(list.documents.map(normalizeDocumentFromApi));
          }
        }
        refresh();
      } else {
        // Fallback refresh in case server didn't return the final document payload.
        const listRes = await fetch(
          `/api/documents?application_id=${encodeURIComponent(application.id)}`
        );
        if (listRes.ok) {
          const list = (await listRes.json()) as {
            documents?: Record<string, unknown>[];
          };
          if (list.documents) {
            setDocuments(list.documents.map(normalizeDocumentFromApi));
          }
        } else {
          refresh();
        }
        refresh();
      }
    } finally {
      setUploadingDocType(null);
      setUploadProgress((p) => {
        const { [docType]: _omit, ...rest } = p;
        return rest;
      });
    }
  }

  async function removeDocument(docId: string) {
    setRemovingId(docId);
    setPatchError(null);
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPatchError(
          typeof data.error === "string" ? data.error : "Remove failed."
        );
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      refresh();
    } finally {
      setRemovingId(null);
    }
  }

  function renderGovtPortalPrepCard() {
    if (documents.length === 0) return null;
    return (
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm transition-shadow duration-150 hover:shadow-md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#1e3a5f]">
              Ready for Govt Portal Upload
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              The OCI portal accepts PDFs under {PORTAL_MAX_KB}KB. Use
              compression for oversized scans; copies are saved in Drive →{" "}
              <span className="font-medium text-[#1e293b]">Compressed</span>.
            </p>
          </div>
          {portalPrep &&
          portalPrep.documents.some(portalNeedsCompress) ? (
            <button
              type="button"
              disabled={compressAllRunning || portalPrepLoading}
              onClick={() => void compressAllOversized()}
              className="mt-2 inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2d4d73] disabled:opacity-50 sm:mt-0"
            >
              {compressAllRunning ? "Compressing…" : "Compress All"}
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-sm font-medium text-[#1e293b]">
          {portalPrepLoading
            ? "Loading file sizes from Google Drive…"
            : portalPrep
              ? `${portalPrep.summary.ready} of ${portalPrep.summary.total} documents ready for govt portal upload`
              : "—"}
        </p>

        {portalPrep && !portalPrepLoading ? (
          <ul className="mt-4 space-y-3">
            {portalPrep.documents.map((row) => {
              const docRow = documents.find((d) => d.id === row.id);
              const busy = Boolean(
                row.drive_file_id && compressingDriveIds[row.drive_file_id]
              );
              const needs = portalNeedsCompress(row);
              return (
                <li
                  key={row.id}
                  className={clsx(
                    "flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
                    row.ready_for_portal
                      ? "border-green-200 bg-green-50/80"
                      : "border-red-200 bg-red-50/50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {row.ready_for_portal ? "✓" : "✗"}
                      </span>
                      <span className="font-medium text-[#1e293b]">
                        {row.file_name ?? "Untitled"}
                      </span>
                      <span className="text-sm text-[#64748b]">
                        ({formatKb(row.size_bytes)})
                      </span>
                    </div>
                    {docRow ? (
                      <p className="mt-0.5 text-xs text-[#64748b]">
                        {docRow.doc_type.replace(/_/g, " ")}
                      </p>
                    ) : null}
                    {row.meta_error ? (
                      <p className="mt-1 text-xs text-amber-800">
                        Could not read size from Drive ({row.meta_error}).
                      </p>
                    ) : null}
                    {row.compressed_size_bytes != null &&
                    row.compressed_drive_url ? (
                      <p className="mt-1 text-xs font-medium text-green-800">
                        Compressed: {formatKb(row.compressed_size_bytes)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {needs ? (
                      <button
                        type="button"
                        disabled={
                          busy || compressAllRunning || !row.drive_file_id
                        }
                        onClick={() =>
                          row.drive_file_id
                            ? void compressPortalFile(row.drive_file_id)
                            : undefined
                        }
                        className="rounded-lg border border-[#1e3a5f] bg-white px-3 py-1.5 text-xs font-semibold text-[#1e3a5f] transition-colors hover:bg-[#eff6ff] disabled:opacity-50"
                      >
                        {busy ? "Compressing…" : "Compress"}
                      </button>
                    ) : null}
                    {row.compressed_drive_url ? (
                      <a
                        href={row.compressed_drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-green-600 bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                      >
                        Download compressed
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4 rounded-xl border border-[#e2e8f0] border-l-4 border-l-[#1e3a5f] bg-white p-6 shadow-sm transition-shadow duration-150 hover:shadow-md sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[#2563eb] transition-colors duration-150 hover:text-blue-700"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1e293b]">
            {application.app_number}{" "}
            <span className="font-normal text-[#64748b]">·</span>{" "}
            {application.customer_name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#64748b]">
            {application.customer_email ? (
              <span>{application.customer_email}</span>
            ) : (
              <span className="text-[#94a3b8]">No email</span>
            )}
            <span className="hidden sm:inline">·</span>
            {application.customer_phone ? (
              <span>{application.customer_phone}</span>
            ) : (
              <span className="text-[#94a3b8]">No phone</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ServiceTypeBadge serviceType={application.service_type} />
            <StatusBadge status={application.status} />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          {application.drive_folder_url ? (
            <a
              href={application.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-4 text-sm font-medium text-[#1e293b] transition-colors duration-150 hover:bg-[#eff6ff]"
            >
              Open Google Drive Folder
            </a>
          ) : null}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#64748b]" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              value={application.status}
              onChange={(e) =>
                patchApplication({ status: e.target.value as Status })
              }
              className="h-10 min-w-[200px] rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
            >
              <option value="docs_pending">Docs Pending</option>
              <option value="ready_for_review">Ready for Review</option>
              <option value="ready_to_submit">Ready to Submit</option>
              <option value="submitted">Submitted</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm transition-shadow duration-150 hover:shadow-md">
        <h2 className="text-sm font-semibold text-[#1e3a5f]">Notes</h2>
        <p className="mt-1 text-xs text-[#64748b]">Saves when you click away.</p>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={onNotesBlur}
          rows={4}
          className="mt-3 w-full resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-[#1e293b] outline-none transition-colors duration-150 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
          placeholder="Internal team notes…"
        />
      </section>

      {patchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#dc2626]">
          {patchError}
        </div>
      ) : null}

      {showDocumentChecklist ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#1e3a5f]">
              {application.service_type === "oci_new"
                ? "OCI New Application — Document checklist"
                : "Document checklist (OCI renewal)"}
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Upload each required document. Optional items can be skipped.
            </p>
          </div>

          <div className="space-y-4">
            {OCI_NEW_CHECKLIST.map((item) => (
              <DocumentChecklistCard
                key={item.doc_type}
                item={item}
                document={docByType.get(item.doc_type)}
                uploading={uploadingDocType === item.doc_type}
                progress={uploadProgress[item.doc_type] ?? null}
                removingId={removingId}
                extractingDocId={extractingDocId}
                onUpload={(file) => uploadFile(item.doc_type, file)}
                onRemove={removeDocument}
                onRetryExtract={(d) => void retryExtractionForDoc(d)}
              />
            ))}
          </div>

          <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-[#1e293b]">
                {requiredUploaded} of {OCI_NEW_REQUIRED_COUNT} required documents
                uploaded
              </span>
              <span className="text-[#64748b]">
                {Math.round(
                  (requiredUploaded / OCI_NEW_REQUIRED_COUNT) * 100
                )}
                %
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#eff6ff]">
              <div
                className="h-full rounded-full bg-[#16a34a] transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (requiredUploaded / OCI_NEW_REQUIRED_COUNT) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {renderGovtPortalPrepCard()}

          {allRequiredUploaded ? (
            <div className="rounded-xl border border-[#e2e8f0] bg-[#eff6ff] p-4 shadow-sm">
              {skipNotice ? (
                <p className="mb-2 text-center text-xs text-[#1e3a5f]/80">
                  {skipNotice}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void processDocuments()}
                disabled={isProcessing}
                className="w-full rounded-lg bg-[#1e3a5f] px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#2d4d73] disabled:opacity-60"
              >
                {isProcessing ? "Processing…" : "Process Documents with AI →"}
              </button>
              <p className="mt-2 text-center text-xs text-[#64748b]">
                Runs OCR + extraction on pending documents only. Retry failed
                docs from each card.
              </p>
              {isProcessing && extractionProgress ? (
                <div className="mt-3 space-y-2 rounded-lg border border-blue-100 bg-blue-50/90 p-3 text-left">
                  <p className="text-sm font-medium text-blue-950 animate-pulse">
                    {extractionProgress.message}
                  </p>
                  {extractionProgress.step != null ? (
                    <>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              100,
                              (extractionProgress.step /
                                extractionProgress.stepTotal) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-blue-900/80">
                        Step {extractionProgress.step} of{" "}
                        {extractionProgress.stepTotal}
                      </p>
                    </>
                  ) : null}
                  <p className="text-xs text-black/50">
                    Document {extractionProgress.docIndex} of{" "}
                    {extractionProgress.docTotal}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-6 text-sm text-[#64748b]">
            Document checklist is available for OCI New and OCI Renewal
            applications. This application uses a different service type; upload
            flows for it are not configured here yet.
          </section>
          {renderGovtPortalPrepCard()}
        </>
      )}
    </div>
  );
}

function DocumentChecklistCard({
  item,
  document,
  uploading,
  progress,
  removingId,
  extractingDocId,
  onUpload,
  onRemove,
  onRetryExtract,
}: {
  item: (typeof OCI_NEW_CHECKLIST)[number];
  document: Document | undefined;
  uploading: boolean;
  progress: number | null;
  removingId: string | null;
  extractingDocId: string | null;
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
  onRetryExtract: (doc: Document) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0];
      if (f) onUpload(f);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading,
    noClick: true,
  });

  const uploaded = Boolean(document);

  return (
    <div
      className={clsx(
        "rounded-xl border p-4 shadow-sm transition-shadow duration-150 hover:shadow-md",
        uploaded
          ? "border-green-200 bg-green-50"
          : "border-[#e2e8f0] bg-white"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1e293b]">{item.label}</h3>
            {item.required ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                Required
              </span>
            ) : (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                Optional
              </span>
            )}
          </div>
          {item.optionalNote ? (
            <p className="mt-1 text-xs text-black/50">{item.optionalNote}</p>
          ) : null}
          <div className="mt-2">
            {uploaded ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <span aria-hidden>✓</span> UPLOADED
              </span>
            ) : (
              <span className="text-xs font-medium text-zinc-500">
                NOT UPLOADED
              </span>
            )}
          </div>
          {uploaded && document ? (
            <div className="mt-2 text-sm text-black/80">
              <span className="font-medium">{document.file_name}</span>
              {document.drive_view_url ? (
                <>
                  {" "}
                  <a
                    href={document.drive_view_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2563eb] underline-offset-2 transition-colors duration-150 hover:text-blue-700"
                  >
                    View in Drive
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
          {uploaded && document ? (
            <div className="mt-2 space-y-1 text-xs">
              {extractingDocId === document.id ? (
                <p className="flex items-center gap-1 font-medium text-blue-700 animate-pulse">
                  <span aria-hidden>🔄</span> Extracting…
                </p>
              ) : shouldSkipAiExtraction(document.doc_type) &&
                document.extraction_status === "done" ? (
                <p className="font-medium text-black/45">
                  <span aria-hidden>⏭️</span> Skipped
                </p>
              ) : document.extraction_status === "pending" ? (
                <p className="font-medium text-black/45">
                  <span aria-hidden>⏳</span> Not started
                </p>
              ) : document.extraction_status === "processing" ? (
                <p className="font-medium text-blue-700 animate-pulse">
                  <span aria-hidden>🔄</span> Extracting…
                </p>
              ) : document.extraction_status === "done" ? (
                <p className="font-medium text-emerald-700">
                  <span aria-hidden>✅</span> Extracted
                </p>
              ) : document.extraction_status === "failed" ? (
                <div className="space-y-1">
                  <p className="font-medium text-red-700">
                    <span aria-hidden>❌</span> Failed
                  </p>
                  <p className="text-[11px] leading-snug text-red-700/90">
                    Failed: {labelForFailureReason(document.failure_reason)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRetryExtract(document)}
                    disabled={extractingDocId === document.id}
                    className="mt-1 inline-flex items-center rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    ↺ Retry
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {uploaded && document ? (
            <button
              type="button"
              disabled={removingId === document.id}
              onClick={() => onRemove(document.id)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-[#dc2626] transition-colors duration-150 hover:bg-red-50 disabled:opacity-50"
            >
              {removingId === document.id ? "Removing…" : "Remove"}
            </button>
          ) : null}
          {!uploaded ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => open()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#2563eb] px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          ) : null}
        </div>
      </div>
      <div
        {...getRootProps()}
        className={clsx(
          "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors duration-150",
          isDragActive
            ? "border-[#2563eb] bg-[#eff6ff]"
            : "border-[#e2e8f0] bg-white hover:border-[#2563eb]/40",
          uploading && "pointer-events-none opacity-50"
        )}
      >
        <input {...getInputProps()} />
        <p className="text-[#64748b]">
          {isDragActive
            ? "Drop the file here…"
            : "Drag and drop a file here, or use Upload"}
        </p>
      </div>
      {uploading && progress != null ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-black/55">
            Uploading… {Math.round(progress * 100)}%
          </div>
        </div>
      ) : null}
    </div>
  );
}
