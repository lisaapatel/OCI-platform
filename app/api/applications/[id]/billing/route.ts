import { NextResponse } from "next/server";

import { applicationFromDbRow } from "@/lib/application-from-row";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PaymentStatus } from "@/lib/types";

const PAYMENT: PaymentStatus[] = ["unpaid", "partial", "paid"];

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      vfs_tracking_number?: string | null;
      govt_tracking_number?: string | null;
      customer_price?: number | null;
      our_cost?: number | null;
      payment_status?: PaymentStatus | null;
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
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json(
            { error: "our_cost must be a positive number when provided." },
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
