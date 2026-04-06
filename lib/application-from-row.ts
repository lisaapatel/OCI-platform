import { normalizeStoredOciIntakeVariant } from "@/lib/oci-intake-variant";
import type {
  Application,
  GovernmentFeesPaidBy,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";

function parsePaymentStatus(
  row: Record<string, unknown>
): PaymentStatus | null | undefined {
  if (!("payment_status" in row)) return undefined;
  const p = row.payment_status;
  if (p == null || p === "") return null;
  const s = String(p);
  if (s === "unpaid" || s === "partial" || s === "paid") {
    return s as PaymentStatus;
  }
  return null;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "zelle",
  "cash",
  "check",
  "credit_card",
];

function parsePaymentMethod(
  row: Record<string, unknown>
): PaymentMethod | null | undefined {
  if (!("payment_method" in row)) return undefined;
  const p = row.payment_method;
  if (p == null || p === "") return null;
  const s = String(p);
  if (PAYMENT_METHODS.includes(s as PaymentMethod)) {
    return s as PaymentMethod;
  }
  return null;
}

const GOV_PAID_BY: GovernmentFeesPaidBy[] = [
  "customer_direct",
  "company_card",
  "company_advanced",
  "not_applicable",
];

function parseGovernmentFeesPaidBy(
  row: Record<string, unknown>,
): GovernmentFeesPaidBy | null | undefined {
  if (!("billing_government_fees_paid_by" in row)) return undefined;
  const p = row.billing_government_fees_paid_by;
  if (p == null || p === "") return null;
  const s = String(p);
  if (GOV_PAID_BY.includes(s as GovernmentFeesPaidBy)) {
    return s as GovernmentFeesPaidBy;
  }
  return null;
}

export function applicationFromDbRow(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    app_number: String(row.app_number ?? ""),
    customer_name: String(row.customer_name ?? ""),
    customer_email: String(row.customer_email ?? ""),
    customer_phone: String(row.customer_phone ?? ""),
    service_type: row.service_type as Application["service_type"],
    status: row.status as Application["status"],
    drive_folder_id: String(row.drive_folder_id ?? ""),
    drive_folder_url: String(row.drive_folder_url ?? ""),
    notes: String(row.notes ?? ""),
    created_at: String(row.created_at ?? ""),
    created_by: String(row.created_by ?? ""),
    archived_at:
      row.archived_at == null || String(row.archived_at) === ""
        ? null
        : String(row.archived_at),
    vfs_tracking_number:
      row.vfs_tracking_number == null || String(row.vfs_tracking_number) === ""
        ? null
        : String(row.vfs_tracking_number),
    govt_tracking_number:
      row.govt_tracking_number == null || String(row.govt_tracking_number) === ""
        ? null
        : String(row.govt_tracking_number),
    oci_file_reference_number:
      row.oci_file_reference_number == null ||
      String(row.oci_file_reference_number) === ""
        ? null
        : String(row.oci_file_reference_number),
    customer_price:
      row.customer_price == null || row.customer_price === ""
        ? null
        : Number(row.customer_price),
    our_cost:
      row.our_cost == null || row.our_cost === "" ? null : Number(row.our_cost),
    payment_status: parsePaymentStatus(row),
    payment_method: parsePaymentMethod(row),
    billing_government_fees:
      row.billing_government_fees == null ||
      row.billing_government_fees === ""
        ? null
        : Number(row.billing_government_fees),
    billing_government_fees_paid_by: parseGovernmentFeesPaidBy(row),
    billing_service_fee:
      row.billing_service_fee == null || row.billing_service_fee === ""
        ? null
        : Number(row.billing_service_fee),
    is_minor: row.is_minor === true,
    oci_intake_variant: normalizeStoredOciIntakeVariant(row.oci_intake_variant),
  };
}
