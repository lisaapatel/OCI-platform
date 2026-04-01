"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message || "Unable to sign in.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand px-6 py-10">
      <BrandLogo variant="login" />
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-brand font-brand-serif">
          OCI Platform
        </h1>
        <p className="mt-2 text-center text-sm text-oci-muted">
          Sign in to your account
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-oci-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-oci-border px-3 py-2 text-sm text-oci-ink outline-none transition-colors duration-150 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-oci-muted"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-oci-border px-3 py-2 text-sm text-oci-ink outline-none transition-colors duration-150 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-oci-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-accent py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
      <p className="mt-8 text-center text-xs text-white/60">
        Akshar Travels
      </p>
    </main>
  );
}
