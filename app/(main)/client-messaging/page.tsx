"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CLIENT_MESSAGING_SERVICES,
  CLIENT_MESSAGING_TEMPLATES,
  composeClientMessagingBody,
  type ClientMessagingServiceId,
  type ClientMessagingTemplate,
} from "@/lib/client-messaging-templates";

function TemplateCard({ template }: { template: ClientMessagingTemplate }) {
  const [copied, setCopied] = useState(false);
  const [minorApplicant, setMinorApplicant] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedBody = useMemo(
    () => composeClientMessagingBody(template, minorApplicant),
    [template, minorApplicant]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(resolvedBody);
    } catch {
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [resolvedBody]);

  const lineCount = resolvedBody.split("\n").length;
  const rows = Math.min(Math.max(lineCount, 8), 24);

  const hasMinorToggle = Boolean(
    template.minorAppend && template.minorInsert
  );

  return (
    <article className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-base font-semibold text-[#1e3a5f]">
          {template.title}
        </h2>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-sm font-medium text-[#1e3a5f] shadow-sm transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/30"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs font-medium text-[#64748b]">
        {template.channelTag}
      </p>
      {hasMinorToggle ? (
        <div className="mt-3">
          <button
            type="button"
            role="switch"
            aria-checked={minorApplicant}
            onClick={() => setMinorApplicant((v) => !v)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/30",
              minorApplicant
                ? "border-[#1e3a5f] bg-[#eff6ff] text-[#1e3a5f]"
                : "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b] hover:border-[#cbd5e1]"
            )}
          >
            <span
              className={clsx(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                minorApplicant ? "bg-[#1e3a5f]" : "bg-[#cbd5e1]"
              )}
              aria-hidden
            >
              <span
                className={clsx(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  minorApplicant ? "left-4" : "left-0.5"
                )}
              />
            </span>
            Minor applicant
          </button>
        </div>
      ) : null}
      <textarea
        readOnly
        value={resolvedBody}
        rows={rows}
        className="mt-3 w-full resize-y rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 font-sans text-sm leading-relaxed text-[#1e293b] outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/20"
        spellCheck={false}
      />
    </article>
  );
}

export default function ClientMessagingPage() {
  const [serviceId, setServiceId] =
    useState<ClientMessagingServiceId>("oci_new");

  const templates = CLIENT_MESSAGING_TEMPLATES[serviceId];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
          Client Messaging
        </h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Pre-written messages for email or WhatsApp. Select a service and copy
          the text you need.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
        <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-[30%] lg:max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
            Service type
          </p>
          <div className="flex flex-col gap-2">
            {CLIENT_MESSAGING_SERVICES.map((svc) => {
              const active = svc.id === serviceId;
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => setServiceId(svc.id)}
                  className={clsx(
                    "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/30",
                    active
                      ? "border-[#1e3a5f] bg-[#1e3a5f] text-white shadow-sm"
                      : "border-[#e2e8f0] bg-white text-[#1e293b] hover:border-[#cbd5e1] hover:bg-[#f8fafc]"
                  )}
                >
                  {svc.label}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:w-[70%]">
          <div className="flex flex-col gap-5">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
