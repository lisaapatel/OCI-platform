import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#f8fafc] p-8">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-[#e2e8f0] bg-white p-8 shadow-sm transition-shadow duration-150 hover:shadow-md">
        <h1 className="text-xl font-bold text-[#1e3a5f]">OCI Platform</h1>
        <p className="text-sm text-[#64748b]">
          Start by logging in to access your dashboard.
        </p>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-700"
          >
            Go to login
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-medium text-[#1e293b] transition-colors duration-150 hover:bg-[#eff6ff]"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
