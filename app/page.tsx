import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-oci-page p-8">
      <div className="w-full max-w-md space-y-2 rounded-xl border border-oci-border bg-white p-8 shadow-sm transition-shadow duration-150 hover:shadow-md">
        <BrandLogo variant="card" />
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
          Visa servicing
        </h1>
        <p className="text-center text-sm text-oci-muted">
          Start by logging in to access your dashboard.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-accent-hover"
          >
            Go to login
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-oci-border bg-white px-4 py-2 text-sm font-medium text-oci-ink transition-colors duration-150 hover:bg-oci-blue-light"
          >
            Dashboard
          </Link>
        </div>
        <p className="pt-4 text-center text-xs text-oci-muted">Akshar Travels</p>
      </div>
    </div>
  );
}
