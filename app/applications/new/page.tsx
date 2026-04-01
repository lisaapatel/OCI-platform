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
        <h1 className="text-2xl font-semibold tracking-tight">New application</h1>
        <p className="mt-1 text-sm text-black/60">
          Create a new application and its Drive folder.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl border border-black/10 bg-white p-6"
      >
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-black">Customer Information</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-black" htmlFor="fullName">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-black/10 placeholder:text-black/40 focus:ring-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya@example.com"
                  className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-black/10 placeholder:text-black/40 focus:ring-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black" htmlFor="phone">
                  Phone
                </label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="555-1234"
                  className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-black/10 placeholder:text-black/40 focus:ring-2"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-black">
              Service Type <span className="text-red-600">*</span>
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
                className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-black/10 focus:ring-2"
              >
                <option value="">Select a service…</option>
                <option value="oci_new">OCI New Application</option>
                <option value="oci_renewal">OCI Renewal / Reissue</option>
                <option value="passport_renewal" disabled>
                  Passport Renewal — Coming Soon
                </option>
              </select>
              <p className="mt-2 text-xs text-black/50">
                Passport Renewal is disabled for now.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-black">Notes</h2>
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
                className="w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-black/10 placeholder:text-black/40 focus:ring-2"
              />
            </div>
          </section>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex h-10 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white shadow-sm hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create Application"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

