"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type ServiceType = "oci_new" | "oci_renewal" | "passport_renewal";
type Status =
  | "docs_pending"
  | "ready_for_review"
  | "ready_to_submit"
  | "submitted"
  | "on_hold";

type DashboardApplication = {
  id: string;
  app_number: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  service_type: ServiceType;
  status: Status;
  created_at: string;
};

function formatCreatedAt(createdAt: string) {
  try {
    // Format in UTC to avoid local timezone shifting dates in UI/tests.
    return new Date(createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return createdAt;
  }
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

async function fetchApplications(): Promise<DashboardApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as DashboardApplication[];
}

export default function DashboardPage() {
  const [applications, setApplications] = useState<DashboardApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [serviceType, setServiceType] = useState<"" | ServiceType>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const apps = await fetchApplications();
        if (alive) setApplications(apps);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      const matchesName = q ? (a.customer_name ?? "").toLowerCase().includes(q) : true;
      const matchesStatus = status ? a.status === status : true;
      const matchesService = serviceType ? a.service_type === serviceType : true;
      return matchesName && matchesStatus && matchesService;
    });
  }, [applications, search, serviceType, status]);

  const stats = useMemo(() => {
    const counts = {
      total: applications.length,
      docs_pending: 0,
      ready_for_review: 0,
      ready_to_submit: 0,
      submitted: 0,
    };

    for (const a of applications) {
      if (a.status === "docs_pending") counts.docs_pending += 1;
      if (a.status === "ready_for_review") counts.ready_for_review += 1;
      if (a.status === "ready_to_submit") counts.ready_to_submit += 1;
      if (a.status === "submitted") counts.submitted += 1;
    }

    return counts;
  }, [applications]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Review and manage all applications.
          </p>
          <p className="mt-2 max-w-xl text-xs text-[#64748b]">
            Before uploading on{" "}
            <span className="font-medium text-[#1e293b]">ociservices.gov.in</span>
            , open each application and confirm{" "}
            <span className="font-medium text-[#1e293b]">
              Govt portal readiness
            </span>{" "}
            (PDFs, photo, signature) is complete.
          </p>
        </div>
        <Link
          href="/applications/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700"
        >
          New Application
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard testId="stat-total" label="Total applications" value={stats.total} />
        <StatCard
          testId="stat-docs-pending"
          label="Docs Pending"
          value={stats.docs_pending}
        />
        <StatCard
          testId="stat-ready-for-review"
          label="Ready for Review"
          value={stats.ready_for_review}
        />
        <StatCard
          testId="stat-ready-to-submit"
          label="Ready to Submit"
          value={stats.ready_to_submit}
        />
        <StatCard testId="stat-submitted" label="Submitted" value={stats.submitted} />
      </div>

      <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#e2e8f0] p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <label className="sr-only" htmlFor="search">
                Search by customer name
              </label>
              <input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer name…"
                className="h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
              />
            </div>

            <div className="flex gap-3">
              <div>
                <label className="sr-only" htmlFor="status">
                  Filter by status
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                >
                  <option value="">All statuses</option>
                  <option value="docs_pending">Docs Pending</option>
                  <option value="ready_for_review">Ready for Review</option>
                  <option value="ready_to_submit">Ready to Submit</option>
                  <option value="submitted">Submitted</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>

              <div>
                <label className="sr-only" htmlFor="serviceType">
                  Filter by service type
                </label>
                <select
                  id="serviceType"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as any)}
                  className="h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                >
                  <option value="">All services</option>
                  <option value="oci_new">OCI New</option>
                  <option value="oci_renewal">OCI Renewal</option>
                  <option value="passport_renewal">Passport Renewal</option>
                </select>
              </div>
            </div>
          </div>

          <div className="text-sm text-[#64748b]">
            {filtered.length} of {applications.length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#f8fafc] text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-4 py-3">App #</th>
                <th className="px-4 py-3">Customer Name</th>
                <th className="px-4 py-3">Service Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-[#64748b]" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-[#64748b]" colSpan={6}>
                    No applications found.
                  </td>
                </tr>
              ) : (
                filtered.map((app) => (
                  <tr
                    key={app.id}
                    className="transition-colors duration-150 hover:bg-[#eff6ff]/50"
                  >
                    <td className="px-4 py-3 font-medium text-[#1e293b]">
                      {app.app_number}
                    </td>
                    <td className="px-4 py-3">{app.customer_name}</td>
                    <td className="px-4 py-3">
                      <ServiceTypeBadge serviceType={app.service_type} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-3 text-[#64748b]">
                      {formatCreatedAt(app.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/applications/${app.id}`}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm font-medium text-[#2563eb] transition-colors duration-150 hover:bg-[#eff6ff]"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-[#e2e8f0] border-l-4 border-l-[#2563eb] bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md"
      data-testid={testId}
    >
      <div className="text-xs font-medium text-[#64748b]">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-[#1e293b]">
        {value}
      </div>
    </div>
  );
}

