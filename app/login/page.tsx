"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || "Unable to sign in. Please try again.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-8 shadow-2xl">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-white">
          OCI Platform
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-400">
          Sign in to continue
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-200"
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
              className="w-full rounded-md border border-white/15 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/40"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-200"
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
              className="w-full rounded-md border border-white/15 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/40"
            />
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}

