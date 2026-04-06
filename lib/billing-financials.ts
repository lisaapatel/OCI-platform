import type { Application, GovernmentFeesPaidBy } from "@/lib/types";

export function usesStructuredBilling(
  serviceType: Application["service_type"],
): boolean {
  return (
    serviceType === "oci_new" ||
    serviceType === "oci_renewal" ||
    serviceType === "passport_renewal"
  );
}

/** Empty → null; valid number ≥ 0; else invalid. */
export function parseNonNegativeMoney(
  s: string,
): number | null | "invalid" {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

/**
 * Service margin: explicit service fee wins; else customer − government fees when both set.
 */
export function computeStructuredServiceMargin(args: {
  customerPrice: number | null;
  governmentFees: number | null;
  explicitServiceFee: number | null;
}): number | null {
  if (args.explicitServiceFee != null) {
    return args.explicitServiceFee;
  }
  if (
    args.customerPrice != null &&
    args.governmentFees != null
  ) {
    return Math.max(0, args.customerPrice - args.governmentFees);
  }
  return null;
}

export const GOVERNMENT_FEES_PAID_BY_OPTIONS: {
  value: GovernmentFeesPaidBy;
  label: string;
}[] = [
  { value: "customer_direct", label: "Customer paid directly" },
  { value: "company_card", label: "We ran customer’s card" },
  { value: "company_advanced", label: "We advanced (company paid)" },
  { value: "not_applicable", label: "N/A" },
];

export function governmentFeesPaidByLabel(
  v: GovernmentFeesPaidBy | null | undefined,
): string {
  if (v == null) return "—";
  const o = GOVERNMENT_FEES_PAID_BY_OPTIONS.find((x) => x.value === v);
  return o?.label ?? String(v);
}
