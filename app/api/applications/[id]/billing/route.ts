import { NextResponse } from "next/server";

import { applicationFromDbRow } from "@/lib/application-from-row";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  GovernmentFeesPaidBy,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";

const PAYMENT: PaymentStatus[] = ["unpaid", "partial", "paid"];
const GOV_FEES_PAID_BY: GovernmentFeesPaidBy[] = [
  "customer_direct",
  "company_card",
  "company_advanced",
  "not_applicable",
];
const PAYMENT_METHODS: PaymentMethod[] = [
  "zelle",
  "cash",
  "check",
  "credit_card",
];

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      vfs_tracking_number?: string | null;
      govt_tracking_number?: string | null;
      oci_file_reference_number?: string | null;
      customer_price?: number | null;
      our_cost?: number | null;
      payment_status?: PaymentStatus | null;
      payment_method?: PaymentMethod | null;
      billing_government_fees?: number | null;
      billing_government_fees_paid_by?: GovernmentFeesPaidBy | null;
      billing_service_fee?: number | null;
    };

    const patch: Record<string, unknown> = {};

    if (body.vfs_tracking_number !== undefined) {
      const v = body.vfs_tracking_number;
      patch.vfs_tracking_number =
        v == null || String(v).trim() === "" ? null : String(v).trim();
    }
    if (body.govt_tracking_number !== undefined) {
      const v = body.govt_tracking_number;
      patch.govt_tracking_number =
        v == null || String(v).trim() === "" ? null : String(v).trim();
    }
    if (body.oci_file_reference_number !== undefined) {
      const v = body.oci_file_reference_number;
      patch.oci_file_reference_number =
        v == null || String(v).trim() === "" ? null : String(v).trim();
    }

    if (body.customer_price !== undefined) {
      if (body.customer_price === null) {
        patch.customer_price = null;
      } else {
        const n = Number(body.customer_price);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json(
            { error: "customer_price must be a positive number when provided." },
            { status: 400 }
          );
        }
        patch.customer_price = n;
      }
    }

    if (body.our_cost !== undefined) {
      if (body.our_cost === null) {
        patch.our_cost = null;
      } else {
        const n = Number(body.our_cost);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: "our_cost must be zero or a positive number when provided." },
            { status: 400 }
          );
        }
        patch.our_cost = n;
      }
    }

    if (body.payment_status !== undefined) {
      if (body.payment_status === null) {
        return NextResponse.json(
          {
            error:
              "payment_status cannot be null (use unpaid, partial, or paid).",
          },
          { status: 400 }
        );
      }
      if (!PAYMENT.includes(body.payment_status)) {
        return NextResponse.json(
          { error: "Invalid payment_status." },
          { status: 400 }
        );
      }
      patch.payment_status = body.payment_status;
    }

    if (body.payment_method !== undefined) {
      if (body.payment_method === null) {
        patch.payment_method = null;
      } else if (!PAYMENT_METHODS.includes(body.payment_method)) {
        return NextResponse.json(
          { error: "Invalid payment_method." },
          { status: 400 }
        );
      } else {
        patch.payment_method = body.payment_method;
      }
    }

    if (body.billing_government_fees !== undefined) {
      if (body.billing_government_fees === null) {
        patch.billing_government_fees = null;
      } else {
        const n = Number(body.billing_government_fees);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            {
              error:
                "billing_government_fees must be zero or a positive number when provided.",
            },
            { status: 400 }
          );
        }
        patch.billing_government_fees = n;
      }
    }

    if (body.billing_government_fees_paid_by !== undefined) {
      if (body.billing_government_fees_paid_by === null) {
        patch.billing_government_fees_paid_by = null;
      } else if (
        !GOV_FEES_PAID_BY.includes(body.billing_government_fees_paid_by)
      ) {
        return NextResponse.json(
          { error: "Invalid billing_government_fees_paid_by." },
          { status: 400 }
        );
      } else {
        patch.billing_government_fees_paid_by =
          body.billing_government_fees_paid_by;
      }
    }

    if (body.billing_service_fee !== undefined) {
      if (body.billing_service_fee === null) {
        patch.billing_service_fee = null;
      } else {
        const n = Number(body.billing_service_fee);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            {
              error:
                "billing_service_fee must be zero or a positive number when provided.",
            },
            { status: 400 }
          );
        }
        patch.billing_service_fee = n;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No billing fields to update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("applications")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Update failed: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        application: applicationFromDbRow(data as Record<string, unknown>),
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
}
