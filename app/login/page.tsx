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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand via-brand to-[#152174] px-6 py-12">
      <BrandLogo variant="login" />
      <div className="w-full max-w-[400px] rounded-2xl border border-white/10 bg-white p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35)] ring-1 ring-slate-200/60">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">
          Visa servicing
        </h1>
        <p className="mt-2.5 text-center text-sm leading-relaxed text-slate-500">
          Sign in to your account
        </p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-brand-accent/25"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all duration-150 focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-brand-accent/25"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200/80 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-accent py-3 text-sm font-semibold text-white shadow-md shadow-brand-accent/25 transition-all duration-150 hover:bg-brand-accent-hover hover:shadow-lg hover:shadow-brand-accent/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <p className="mt-10 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
        Akshar Travels
      </p>
    </main>
  );
}
