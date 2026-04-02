"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import type { Application, PaymentStatus } from "@/lib/types";

type Props = {
  application: Application;
  onApplicationUpdated: (app: Application) => void;
};

function parseMoney(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function BillingTrackingSection({
  application,
  onApplicationUpdated,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [vfs, setVfs] = useState("");
  const [govt, setGovt] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [costStr, setCostStr] = useState("");
  const [payment, setPayment] = useState<PaymentStatus>("unpaid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setVfs(application.vfs_tracking_number ?? "");
    setGovt(application.govt_tracking_number ?? "");
    setPriceStr(
      application.customer_price != null && Number.isFinite(application.customer_price)
        ? String(application.customer_price)
        : ""
    );
    setCostStr(
      application.our_cost != null && Number.isFinite(application.our_cost)
        ? String(application.our_cost)
        : ""
    );
    setPayment(application.payment_status ?? "unpaid");
  }, [application]);

  const priceNum = parseMoney(priceStr);
  const costNum = parseMoney(costStr);
  const profit =
    priceNum != null && costNum != null ? priceNum - costNum : null;

  const save = useCallback(async () => {
    setError(null);
    const customer_price = parseMoney(priceStr);
    const our_cost = parseMoney(costStr);
    if (priceStr.trim() !== "" && customer_price === null) {
      setError("Customer charged must be a positive number or empty.");
      return;
    }
    if (costStr.trim() !== "" && our_cost === null) {
      setError("Our cost must be a positive number or empty.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(application.id)}/billing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vfs_tracking_number: vfs.trim() === "" ? null : vfs.trim(),
            govt_tracking_number: govt.trim() === "" ? null : govt.trim(),
            customer_price,
            our_cost,
            payment_status: payment,
          }),
        }
      );
      const data = (await res.json()) as {
        error?: string;
        application?: Application;
      };
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      if (data.application) {
        onApplicationUpdated(data.application);
      }
      setToast("Billing & tracking saved.");
      window.setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    application.id,
    vfs,
    govt,
    priceStr,
    costStr,
    payment,
    onApplicationUpdated,
  ]);

  return (
    <section className="rounded-xl border border-[#1e3a5f] border-l-4 border-l-[#2563eb] bg-white p-0 shadow-sm transition-shadow duration-150 hover:shadow-md">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={expanded}
      >
        <div>
          <h2 className="text-base font-bold tracking-tight text-[#1e3a5f]">
            Billing &amp; Tracking
          </h2>
          <p className="mt-0.5 text-xs text-[#64748b]">
            VFS / govt tracking numbers and sale vs. cost for this application.
          </p>
        </div>
        <span
          className="shrink-0 text-sm font-medium text-[#1e3a5f]"
          aria-hidden
        >
          {expanded ? "▼" : "▶"}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-5 border-t border-[#e2e8f0] px-5 pb-5 pt-4">
          {toast ? (
            <div
              className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-900"
              role="status"
            >
              {toast}
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Tracking numbers
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  className="block text-sm font-medium text-[#1e293b]"
                  htmlFor="vfs-tracking"
                >
                  VFS tracking #
                </label>
                <input
                  id="vfs-tracking"
                  value={vfs}
                  onChange={(e) => setVfs(e.target.value)}
                  placeholder="e.g. VFS1234567890"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-[#1e293b]"
                  htmlFor="govt-tracking"
                >
                  Govt tracking #
                </label>
                <input
                  id="govt-tracking"
                  value={govt}
                  onChange={(e) => setGovt(e.target.value)}
                  placeholder="e.g. OCI-2024-XXXXXXXX"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Financials
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  className="block text-sm font-medium text-[#1e293b]"
                  htmlFor="customer-price"
                >
                  Customer charged ($)
                </label>
                <input
                  id="customer-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-[#1e293b]"
                  htmlFor="our-cost"
                >
                  Our cost ($)
                </label>
                <input
                  id="our-cost"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={costStr}
                  onChange={(e) => setCostStr(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>
              <div>
                <span className="block text-sm font-medium text-[#1e293b]">
                  Profit
                </span>
                <div
                  className={clsx(
                    "mt-1 flex h-10 items-center rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-sm font-semibold tabular-nums",
                    profit == null
                      ? "text-[#64748b]"
                      : profit >= 0
                        ? "text-green-700"
                        : "text-red-700"
                  )}
                >
                  {profit == null
                    ? "—"
                    : `${profit < 0 ? "-" : ""}$${Math.abs(profit).toFixed(2)}`}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Payment status
            </h3>
            <label className="sr-only" htmlFor="payment-status">
              Payment status
            </label>
            <select
              id="payment-status"
              value={payment}
              onChange={(e) =>
                setPayment(e.target.value as PaymentStatus)
              }
              className="mt-3 h-10 w-full max-w-md rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25 sm:w-auto"
            >
              <option value="unpaid">🔴 Unpaid</option>
              <option value="partial">🟡 Partially paid</option>
              <option value="paid">🟢 Paid</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2d4d73] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save billing & tracking"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
