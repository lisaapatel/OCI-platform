"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  computeStructuredServiceMargin,
  GOVERNMENT_FEES_PAID_BY_OPTIONS,
  governmentFeesPaidByLabel,
  parseNonNegativeMoney,
  usesStructuredBilling,
} from "@/lib/billing-financials";
import { isOciServiceType } from "@/lib/oci-intake-variant";
import type {
  Application,
  GovernmentFeesPaidBy,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";

import { BillingPortalPdfHint } from "./application-pdf-downloads";

type Props = {
  application: Application;
  onApplicationUpdated: (app: Application) => void;
};

/** Customer charged: empty or invalid → null; must be positive when set. */
function parseCustomerCharged(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type OurCostParse = number | null | "invalid";

/** Our cost (DS-82 legacy): empty → null. Zero or positive → number. */
function parseOurCostForSave(s: string): OurCostParse {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

/**
 * Profit = customer charged − our cost. Empty cost treated as 0 (legacy DS-82).
 */
function computeLegacyProfit(priceStr: string, costStr: string): number | null {
  const pt = priceStr.trim();
  if (pt === "") return null;
  const price = Number(pt);
  if (!Number.isFinite(price) || price < 0) return null;

  const ct = costStr.trim();
  const cost = ct === "" ? 0 : Number(ct);
  if (!Number.isFinite(cost) || cost < 0) return null;

  return price - cost;
}

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit card" },
];

export function BillingTrackingSection({
  application,
  onApplicationUpdated,
}: Props) {
  const showOciFileRef = isOciServiceType(application.service_type);
  const structured = usesStructuredBilling(application.service_type);

  const [expanded, setExpanded] = useState(true);
  const [vfs, setVfs] = useState("");
  const [govt, setGovt] = useState("");
  const [ociFileRef, setOciFileRef] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [costStr, setCostStr] = useState("");
  const [govFeesStr, setGovFeesStr] = useState("");
  const [govPaidBy, setGovPaidBy] = useState<GovernmentFeesPaidBy | "">("");
  const [serviceFeeStr, setServiceFeeStr] = useState("");
  const [payment, setPayment] = useState<PaymentStatus>("unpaid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setVfs(application.vfs_tracking_number ?? "");
    setGovt(application.govt_tracking_number ?? "");
    setOciFileRef(application.oci_file_reference_number ?? "");
    setPriceStr(
      application.customer_price != null &&
        Number.isFinite(application.customer_price)
        ? String(application.customer_price)
        : ""
    );
    setCostStr(
      application.our_cost != null && Number.isFinite(application.our_cost)
        ? String(application.our_cost)
        : ""
    );
    setGovFeesStr(
      application.billing_government_fees != null &&
        Number.isFinite(application.billing_government_fees)
        ? String(application.billing_government_fees)
        : ""
    );
    const gpb = application.billing_government_fees_paid_by;
    setGovPaidBy(
      gpb === "customer_direct" ||
        gpb === "company_card" ||
        gpb === "company_advanced" ||
        gpb === "not_applicable"
        ? gpb
        : ""
    );
    setServiceFeeStr(
      application.billing_service_fee != null &&
        Number.isFinite(application.billing_service_fee)
        ? String(application.billing_service_fee)
        : ""
    );
    setPayment(application.payment_status ?? "unpaid");
    const pm = application.payment_method;
    setPaymentMethod(
      pm === "zelle" ||
        pm === "cash" ||
        pm === "check" ||
        pm === "credit_card"
        ? pm
        : ""
    );
  }, [application]);

  const customerNum = parseCustomerCharged(priceStr);
  const govFeesParsed = parseNonNegativeMoney(govFeesStr);
  const serviceFeeParsed = parseNonNegativeMoney(serviceFeeStr);

  const serviceMargin = useMemo(() => {
    if (!structured) return null;
    const gov =
      govFeesParsed === "invalid" ? null : govFeesParsed;
    const svc =
      serviceFeeStr.trim() === ""
        ? null
        : serviceFeeParsed === "invalid"
          ? null
          : serviceFeeParsed;
    return computeStructuredServiceMargin({
      customerPrice: customerNum,
      governmentFees: gov,
      explicitServiceFee: svc,
    });
  }, [
    structured,
    customerNum,
    govFeesParsed,
    serviceFeeStr,
    serviceFeeParsed,
  ]);

  const impliedServiceMismatch = useMemo(() => {
    if (!structured) return false;
    if (serviceFeeStr.trim() === "") return false;
    if (
      serviceFeeParsed === "invalid" ||
      serviceFeeParsed === null ||
      customerNum == null ||
      govFeesParsed === "invalid" ||
      govFeesParsed == null
    ) {
      return false;
    }
    const explicitSvc = serviceFeeParsed;
    const implied = Math.max(0, customerNum - govFeesParsed);
    return Math.abs(explicitSvc - implied) > 0.02;
  }, [
    structured,
    serviceFeeStr,
    serviceFeeParsed,
    customerNum,
    govFeesParsed,
  ]);

  const legacyProfit = computeLegacyProfit(priceStr, costStr);

  const save = useCallback(async () => {
    setError(null);
    const customer_price = parseCustomerCharged(priceStr);

    if (priceStr.trim() !== "" && customer_price === null) {
      setError("Customer charged must be a positive number or empty.");
      return;
    }

    let our_cost: number | null | undefined;
    let billing_government_fees: number | null | undefined;
    let billing_government_fees_paid_by: GovernmentFeesPaidBy | null | undefined;
    let billing_service_fee: number | null | undefined;

    if (structured) {
      if (govFeesParsed === "invalid") {
        setError("Government fees must be zero or a positive number, or empty.");
        return;
      }
      if (serviceFeeStr.trim() !== "" && serviceFeeParsed === "invalid") {
        setError("Service fee must be zero or a positive number, or empty.");
        return;
      }
      billing_government_fees = govFeesParsed;
      billing_government_fees_paid_by =
        govPaidBy === "" ? null : govPaidBy;
      billing_service_fee =
        serviceFeeStr.trim() === "" ||
        serviceFeeParsed === "invalid" ||
        serviceFeeParsed === null
          ? null
          : serviceFeeParsed;
      our_cost = undefined;
    } else {
      const ourCostParsed = parseOurCostForSave(costStr);
      if (ourCostParsed === "invalid") {
        setError("Our cost must be zero or a positive number, or empty.");
        return;
      }
      our_cost = ourCostParsed;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        vfs_tracking_number: vfs.trim() === "" ? null : vfs.trim(),
        govt_tracking_number: govt.trim() === "" ? null : govt.trim(),
        ...(showOciFileRef
          ? {
              oci_file_reference_number:
                ociFileRef.trim() === "" ? null : ociFileRef.trim(),
            }
          : {}),
        customer_price,
        payment_status: payment,
        payment_method:
          paymentMethod === "" ? null : (paymentMethod as PaymentMethod),
      };

      if (structured) {
        body.billing_government_fees = billing_government_fees ?? null;
        body.billing_government_fees_paid_by =
          billing_government_fees_paid_by ?? null;
        body.billing_service_fee = billing_service_fee ?? null;
      } else {
        body.our_cost = our_cost ?? null;
      }

      const res = await fetch(
        `/api/applications/${encodeURIComponent(application.id)}/billing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
    structured,
    showOciFileRef,
    vfs,
    govt,
    ociFileRef,
    priceStr,
    costStr,
    govFeesParsed,
    govPaidBy,
    serviceFeeStr,
    serviceFeeParsed,
    payment,
    paymentMethod,
    onApplicationUpdated,
  ]);

  const showGovSummary =
    structured &&
    (govFeesStr.trim() !== "" || govPaidBy !== "");

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
            {structured
              ? "Tracking numbers, customer total, government fees, and service margin."
              : "VFS / govt tracking numbers and sale vs. cost for this application."}
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
            <div
              className={clsx(
                "mt-3 grid gap-4",
                showOciFileRef ? "sm:grid-cols-3" : "sm:grid-cols-2"
              )}
            >
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
              {showOciFileRef ? (
                <div>
                  <label
                    className="block text-sm font-medium text-[#1e293b]"
                    htmlFor="oci-file-ref"
                  >
                    OCI file reference #
                  </label>
                  <input
                    id="oci-file-ref"
                    value={ociFileRef}
                    onChange={(e) => setOciFileRef(e.target.value)}
                    placeholder="e.g. OCIUSA2024XXXXXXXX"
                    className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                  />
                  <p className="mt-1 text-[11px] leading-snug text-[#64748b]">
                    From the government OCI portal after the applicant completes
                    the online form. Required for the undertaking PDF.
                  </p>
                </div>
              ) : null}
            </div>
            {isOciServiceType(application.service_type) ? (
              <BillingPortalPdfHint />
            ) : null}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Financials
            </h3>

            {structured ? (
              <div className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label
                      className="block text-sm font-medium text-[#1e293b]"
                      htmlFor="customer-price"
                    >
                      Total customer charged ($)
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
                      htmlFor="gov-fees"
                    >
                      Government fees ($)
                    </label>
                    <input
                      id="gov-fees"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={govFeesStr}
                      onChange={(e) => setGovFeesStr(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-[#64748b]">
                      VFS + government portal fees if one combined amount.
                    </p>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium text-[#1e293b]"
                      htmlFor="service-fee"
                    >
                      Service fee ($){" "}
                      <span className="font-normal text-[#64748b]">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="service-fee"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={serviceFeeStr}
                      onChange={(e) => setServiceFeeStr(e.target.value)}
                      placeholder="Leave blank to derive from total − gov fees"
                      className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                    />
                  </div>
                </div>

                <div className="max-w-md">
                  <label
                    className="block text-sm font-medium text-[#1e293b]"
                    htmlFor="gov-paid-by"
                  >
                    Government fees paid by
                  </label>
                  <select
                    id="gov-paid-by"
                    value={govPaidBy}
                    onChange={(e) =>
                      setGovPaidBy(
                        (e.target.value || "") as GovernmentFeesPaidBy | ""
                      )
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                  >
                    <option value="">Not set</option>
                    {GOVERNMENT_FEES_PAID_BY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {govPaidBy === "company_advanced" ? (
                    <p className="mt-1 text-[11px] leading-snug text-amber-900/90">
                      Track reimbursement separately if the company advanced
                      these fees.
                    </p>
                  ) : null}
                </div>

                {impliedServiceMismatch ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Service fee differs from total charged minus government fees
                    {customerNum != null && govFeesParsed !== "invalid" && govFeesParsed != null
                      ? ` ($${Math.max(0, customerNum - govFeesParsed).toFixed(2)} implied).`
                      : "."}{" "}
                    Confirm which number is correct for your records.
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  {showGovSummary ? (
                    <div>
                      <span className="block text-sm font-medium text-[#1e293b]">
                        Government fees summary
                      </span>
                      <div className="mt-1 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm text-[#334155]">
                        {govFeesStr.trim() !== "" &&
                        govFeesParsed !== "invalid" &&
                        govFeesParsed != null ? (
                          <span className="font-semibold tabular-nums">
                            ${govFeesParsed.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[#64748b]">Amount not set</span>
                        )}
                        {govPaidBy !== "" ? (
                          <span className="mt-1 block text-xs text-[#64748b]">
                            Paid by: {governmentFeesPaidByLabel(govPaidBy)}
                          </span>
                        ) : (
                          <span className="mt-1 block text-xs text-[#64748b]">
                            Payer not set
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <span className="block text-sm font-medium text-[#1e293b]">
                      Service margin
                    </span>
                    <p className="mt-0.5 text-[11px] text-[#64748b]">
                      Your fee portion (explicit service fee, or total −
                      government fees).
                    </p>
                    <div
                      className={clsx(
                        "mt-1 flex min-h-10 items-center rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm font-semibold tabular-nums",
                        serviceMargin == null
                          ? "text-[#64748b]"
                          : serviceMargin >= 0
                            ? "text-green-700"
                            : "text-red-700"
                      )}
                    >
                      {serviceMargin == null
                        ? "—"
                        : `${serviceMargin < 0 ? "-" : ""}$${Math.abs(serviceMargin).toFixed(2)}`}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label
                    className="block text-sm font-medium text-[#1e293b]"
                    htmlFor="customer-price-legacy"
                  >
                    Customer charged ($)
                  </label>
                  <input
                    id="customer-price-legacy"
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
                      legacyProfit == null
                        ? "text-[#64748b]"
                        : legacyProfit >= 0
                          ? "text-green-700"
                          : "text-red-700"
                    )}
                  >
                    {legacyProfit == null
                      ? "—"
                      : `${legacyProfit < 0 ? "-" : ""}$${Math.abs(legacyProfit).toFixed(2)}`}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Payment
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-end">
              <div>
                <label
                  className="block text-sm font-medium text-[#1e293b]"
                  htmlFor="payment-type"
                >
                  Payment type
                </label>
                <select
                  id="payment-type"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(
                      (e.target.value || "") as PaymentMethod | ""
                    )
                  }
                  className="mt-1 h-10 w-full max-w-md rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                >
                  <option value="">Not set</option>
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-[#1e293b]"
                  htmlFor="payment-status"
                >
                  Payment status
                </label>
                <select
                  id="payment-status"
                  value={payment}
                  onChange={(e) =>
                    setPayment(e.target.value as PaymentStatus)
                  }
                  className="mt-1 h-10 w-full max-w-md rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                >
                  <option value="unpaid">🔴 Unpaid</option>
                  <option value="partial">🟡 Partially paid</option>
                  <option value="paid">🟢 Paid</option>
                </select>
              </div>
            </div>
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
