import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-black/10 bg-white p-6">
        <h1 className="text-xl font-semibold">OCI filler</h1>
        <p className="text-sm text-black/70">
          Start by logging in to access your dashboard.
        </p>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Go to login
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

