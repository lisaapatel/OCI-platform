"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

import type { Application, Document } from "@/lib/types";
import {
  OCI_NEW_CHECKLIST,
  OCI_NEW_REQUIRED_COUNT,
} from "@/lib/oci-new-checklist";

type ServiceType = Application["service_type"];
type Status = Application["status"];

function ServiceTypeBadge({ serviceType }: { serviceType: ServiceType }) {
  const label =
    serviceType === "oci_new"
      ? "OCI New"
      : serviceType === "oci_renewal"
        ? "OCI Renewal"
        : "Passport Renewal";
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-black/80">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const { label, className } =
    status === "docs_pending"
      ? {
          label: "Docs Pending",
          className: "bg-zinc-100 text-zinc-700 ring-zinc-200",
        }
      : status === "ready_for_review"
        ? {
            label: "Ready for Review",
            className: "bg-amber-100 text-amber-800 ring-amber-200",
          }
        : status === "ready_to_submit"
          ? {
              label: "Ready to Submit",
              className: "bg-blue-100 text-blue-800 ring-blue-200",
            }
          : status === "submitted"
            ? {
                label: "Submitted",
                className: "bg-emerald-100 text-emerald-800 ring-emerald-200",
              }
            : { label: "On Hold", className: "bg-red-100 text-red-800 ring-red-200" };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);

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
    console.log("Process Documents clicked", { applicationId: application.id });
    setPatchError(null);
    setIsProcessing(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: application.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Unknown error";
        const full = `Extraction failed: ${msg}`;
        setPatchError(full);
        alert(full);
        return;
      }

      router.push(`/applications/${application.id}/review`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPatchError(msg);
      alert(`Extraction failed: ${msg}`);
    } finally {
      setIsProcessing(false);
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
            data.document!,
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
          const list = (await listRes.json()) as { documents?: Document[] };
          if (list.documents) setDocuments(list.documents);
        }
        refresh();
      } else {
        // Fallback refresh in case server didn't return the final document payload.
        const listRes = await fetch(
          `/api/documents?application_id=${encodeURIComponent(application.id)}`
        );
        if (listRes.ok) {
          const list = (await listRes.json()) as { documents?: Document[] };
          if (list.documents) setDocuments(list.documents);
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

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-black/55 hover:text-black"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {application.app_number}{" "}
            <span className="font-normal text-black/60">·</span>{" "}
            {application.customer_name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-black/70">
            {application.customer_email ? (
              <span>{application.customer_email}</span>
            ) : (
              <span className="text-black/40">No email</span>
            )}
            <span className="hidden sm:inline">·</span>
            {application.customer_phone ? (
              <span>{application.customer_phone}</span>
            ) : (
              <span className="text-black/40">No phone</span>
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
              className="inline-flex h-10 items-center justify-center rounded-md border border-black/15 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
            >
              Open Google Drive Folder
            </a>
          ) : null}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-black/55" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              value={application.status}
              onChange={(e) =>
                patchApplication({ status: e.target.value as Status })
              }
              className="h-10 min-w-[200px] rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-black/10 focus:ring-2"
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

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="text-sm font-semibold text-black">Notes</h2>
        <p className="mt-1 text-xs text-black/50">Saves when you click away.</p>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={onNotesBlur}
          rows={4}
          className="mt-3 w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-black/10 focus:ring-2"
          placeholder="Internal team notes…"
        />
      </section>

      {patchError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {patchError}
        </div>
      ) : null}

      {showDocumentChecklist ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {application.service_type === "oci_new"
                ? "OCI New Application — Document checklist"
                : "Document checklist (OCI renewal)"}
            </h2>
            <p className="mt-1 text-sm text-black/60">
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
                onUpload={(file) => uploadFile(item.doc_type, file)}
                onRemove={removeDocument}
              />
            ))}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-black">
                {requiredUploaded} of {OCI_NEW_REQUIRED_COUNT} required documents
                uploaded
              </span>
              <span className="text-black/50">
                {Math.round(
                  (requiredUploaded / OCI_NEW_REQUIRED_COUNT) * 100
                )}
                %
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (requiredUploaded / OCI_NEW_REQUIRED_COUNT) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {allRequiredUploaded ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <button
                type="button"
                onClick={() => void processDocuments()}
                disabled={isProcessing}
                className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
              >
                {isProcessing ? "Processing…" : "Process Documents with AI →"}
              </button>
              <p className="mt-2 text-center text-xs text-emerald-900/70">
                {isProcessing
                  ? "Running extraction… this may take a moment."
                  : "Runs OCR + extraction on pending documents."}
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="rounded-xl border border-black/10 bg-zinc-50 p-6 text-sm text-black/70">
          Document checklist is available for OCI New and OCI Renewal
          applications. This application uses a different service type; upload
          flows for it are not configured here yet.
        </section>
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
  onUpload,
  onRemove,
}: {
  item: (typeof OCI_NEW_CHECKLIST)[number];
  document: Document | undefined;
  uploading: boolean;
  progress: number | null;
  removingId: string | null;
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
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
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-black">{item.label}</h3>
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
                    className="text-blue-700 underline underline-offset-2"
                  >
                    View in Drive
                  </a>
                </>
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
              className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {removingId === document.id ? "Removing…" : "Remove"}
            </button>
          ) : null}
          {!uploaded ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => open()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-black px-3 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          ) : null}
        </div>
      </div>
      <div
        {...getRootProps()}
        className={clsx(
          "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
          isDragActive
            ? "border-black/40 bg-zinc-50"
            : "border-black/15 bg-zinc-50/50 hover:border-black/25",
          uploading && "pointer-events-none opacity-50"
        )}
      >
        <input {...getInputProps()} />
        <p className="text-black/70">
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
