"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ociIntakeVariantFromAnswers,
  OCI_NEW_APP_INTAKE_COPY,
  type OciFirstTimeTrack,
  type OciRegistrationKind,
} from "@/lib/oci-intake-ui";
import { isOciServiceType } from "@/lib/oci-intake-variant";

type ServiceType =
  | "oci_new"
  | "oci_renewal"
  | "passport_renewal"
  | "passport_us_renewal_test";

export default function NewApplicationPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [isMinor, setIsMinor] = useState(false);
  const [notes, setNotes] = useState("");
  const [ociRegistrationKind, setOciRegistrationKind] = useState<
    "" | OciRegistrationKind
  >("");
  const [ociFirstTimeTrack, setOciFirstTimeTrack] = useState<
    "" | OciFirstTimeTrack
  >("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ociIntakeVariant = useMemo(
    () => ociIntakeVariantFromAnswers(ociRegistrationKind, ociFirstTimeTrack),
    [ociRegistrationKind, ociFirstTimeTrack]
  );

  const isOci = serviceType !== "" && isOciServiceType(serviceType);

  const canSubmit = useMemo(() => {
    if (!fullName.trim()) return false;
    if (!serviceType) return false;
    if (isOci && ociIntakeVariant === null) return false;
    return true;
  }, [fullName, serviceType, isOci, ociIntakeVariant]);

  function onServiceTypeChange(next: ServiceType | "") {
    setServiceType(next);
    if (next === "" || !isOciServiceType(next)) {
      setOciRegistrationKind("");
      setOciFirstTimeTrack("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        customer_name: fullName,
        customer_email: email,
        customer_phone: phone,
        service_type: serviceType,
        notes,
        is_minor: isMinor,
      };
      if (isOci && ociIntakeVariant !== null) {
        payload.oci_intake_variant = ociIntakeVariant;
      }

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
                onChange={(e) =>
                  onServiceTypeChange(e.target.value as ServiceType | "")
                }
                className="h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] outline-none transition-colors duration-150 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/25"
              >
                <option value="">Select a service…</option>
                <option value="oci_new">OCI New Application</option>
                <option value="oci_renewal">OCI Renewal / Reissue</option>
                <option value="passport_renewal">
                  Indian Passport Renewal (VFS Global USA)
                </option>
                <option value="passport_us_renewal_test">
                  US Passport renewal (DS-82) — PDF test only
                </option>
              </select>
              <p className="mt-2 text-xs text-[#64748b]">
                Indian Passport Renewal uses VFS Global USA document and photo
                requirements. The DS-82 option is an internal POC for filled PDF
                generation.
              </p>
            </div>

            {isOci ? (
              <div className="mt-4 space-y-5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <fieldset>
                  <legend className="text-sm font-medium text-[#1e293b]">
                    {OCI_NEW_APP_INTAKE_COPY.q1Legend}{" "}
                    <span className="text-[#dc2626]">*</span>
                  </legend>
                  <div className="mt-2 space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-[#334155]">
                      <input
                        type="radio"
                        name="ociRegistrationKind"
                        value="first_time"
                        checked={ociRegistrationKind === "first_time"}
                        onChange={() => {
                          setOciRegistrationKind("first_time");
                        }}
                        className="mt-0.5"
                      />
                      <span>{OCI_NEW_APP_INTAKE_COPY.q1FirstTime}</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-[#334155]">
                      <input
                        type="radio"
                        name="ociRegistrationKind"
                        value="existing"
                        checked={ociRegistrationKind === "existing"}
                        onChange={() => {
                          setOciRegistrationKind("existing");
                          setOciFirstTimeTrack("");
                        }}
                        className="mt-0.5"
                      />
                      <span>{OCI_NEW_APP_INTAKE_COPY.q1Existing}</span>
                    </label>
                  </div>
                </fieldset>

                {ociRegistrationKind === "first_time" ? (
                  <fieldset>
                    <legend className="text-sm font-medium text-[#1e293b]">
                      {OCI_NEW_APP_INTAKE_COPY.q2Legend}{" "}
                      <span className="text-[#dc2626]">*</span>
                    </legend>
                    <div className="mt-2 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-[#334155]">
                        <input
                          type="radio"
                          name="ociFirstTimeTrack"
                          value="prev_indian"
                          checked={ociFirstTimeTrack === "prev_indian"}
                          onChange={() =>
                            setOciFirstTimeTrack("prev_indian")
                          }
                          className="mt-0.5"
                        />
                        <span>{OCI_NEW_APP_INTAKE_COPY.q2PrevIndian}</span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-[#334155]">
                        <input
                          type="radio"
                          name="ociFirstTimeTrack"
                          value="foreign_birth"
                          checked={ociFirstTimeTrack === "foreign_birth"}
                          onChange={() =>
                            setOciFirstTimeTrack("foreign_birth")
                          }
                          className="mt-0.5"
                        />
                        <span>{OCI_NEW_APP_INTAKE_COPY.q2ForeignBirth}</span>
                      </label>
                    </div>
                  </fieldset>
                ) : null}

                <fieldset>
                  <legend className="text-sm font-medium text-[#1e293b]">
                    {OCI_NEW_APP_INTAKE_COPY.q3Legend}
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#334155]">
                      <input
                        type="radio"
                        name="ociMinor"
                        checked={!isMinor}
                        onChange={() => setIsMinor(false)}
                      />
                      <span>No</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#334155]">
                      <input
                        type="radio"
                        name="ociMinor"
                        checked={isMinor}
                        onChange={() => setIsMinor(true)}
                      />
                      <span>Yes</span>
                    </label>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#64748b]">
                    {OCI_NEW_APP_INTAKE_COPY.q3Help}
                  </p>
                </fieldset>
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                <input
                  id="isMinor"
                  type="checkbox"
                  checked={isMinor}
                  onChange={(e) => setIsMinor(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#2563eb]/25"
                />
                <div>
                  <label
                    htmlFor="isMinor"
                    className="text-sm font-medium text-[#1e293b]"
                  >
                    Minor applicant
                  </label>
                  <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
                    When checked, we collect parent passport (father or mother)
                    and parent address proof for every service type.
                  </p>
                </div>
              </div>
            )}
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
