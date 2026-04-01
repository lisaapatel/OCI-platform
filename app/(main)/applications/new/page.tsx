"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ServiceType = "oci_new" | "oci_renewal" | "passport_renewal";

export default function NewApplicationPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!fullName.trim()) return false;
    if (!serviceType) return false;
    if (serviceType === "passport_renewal") return false;
    return true;
  }, [fullName, serviceType]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: fullName,
          customer_email: email,
          customer_phone: phone,
          service_type: serviceType,
          notes,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to create application.");
      }
      if (!data.id) {
        throw new Error("API did not return a new application id.");
      }

      router.push(`/applications/${data.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
          New application
        </h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Create a new application and its Drive folder.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm transition-shadow duration-150 hover:shadow-md"
      >
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-[#1e3a5f]">
              Customer Information
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  className="block text-sm font-medium text-[#64748b]"
                  htmlFor="fullName"
                >
                  Full Name <span className="text-[#dc2626]">*</span>
                </label>
                <input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-[#64748b]"
                  htmlFor="email"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya@example.com"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-[#64748b]"
                  htmlFor="phone"
                >
                  Phone
                </label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="555-1234"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#1e3a5f]">
              Service Type <span className="text-[#dc2626]">*</span>
            </h2>
            <div className="mt-4">
              <label className="sr-only" htmlFor="serviceType">
                Service Type
              </label>
              <select
                id="serviceType"
                required
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as any)}
                className="h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
              >
                <option value="">Select a service…</option>
                <option value="oci_new">OCI New Application</option>
                <option value="oci_renewal">OCI Renewal / Reissue</option>
                <option value="passport_renewal" disabled>
                  Passport Renewal — Coming Soon
                </option>
              </select>
              <p className="mt-2 text-xs text-[#64748b]">
                Passport Renewal is disabled for now.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#1e3a5f]">Notes</h2>
            <div className="mt-4">
              <label className="sr-only" htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal team notes (optional)…"
                rows={4}
                className="w-full resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-[#1e293b] outline-none transition-colors duration-150 placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
              />
            </div>
          </section>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#dc2626]">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create Application"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

