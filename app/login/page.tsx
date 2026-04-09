"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_ENV, supabase } from "../../lib/supabase";

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      setIsCheckingSession(true);

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setMessage(`Session check failed: ${error.message}`);
        setIsCheckingSession(false);
        return;
      }

      if (!session?.user) {
        setIsCheckingSession(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, coach_id, coach_name")
        .eq("id", session.user.id)
        .eq("environment", APP_ENV)
        .single();

      if (!isMounted) return;

      if (profileError) {
        setMessage(`Profile check failed: ${profileError.message}`);
        setIsCheckingSession(false);
        return;
      }

      if (!(profile as UserProfileRow | null)) {
        setMessage("No profile found for this account.");
        setIsCheckingSession(false);
        return;
      }

      router.replace("/select-team");
    }

    void checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setMessage("Enter your email address.");
      return;
    }

    if (!password) {
      setMessage("Enter your password.");
      return;
    }

    setIsSigningIn(true);
    setMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setMessage(`Login failed: ${error.message}`);
      setIsSigningIn(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setMessage("Login succeeded, but no user was returned.");
      setIsSigningIn(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, coach_id, coach_name")
      .eq("id", user.id)
      .eq("environment", APP_ENV)
      .single();

    if (profileError) {
      setMessage(`Profile load failed: ${profileError.message}`);
      setIsSigningIn(false);
      return;
    }

    if (!(profile as UserProfileRow | null)) {
      setMessage("No profile found for this user.");
      setIsSigningIn(false);
      return;
    }

    router.replace("/select-team");
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Coach Team Login</h1>
            <p className="mt-2 text-sm text-white/70">
              Sign in with your Supabase Auth email and password.
            </p>
          </div>

          <div
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              APP_ENV === "preview"
                ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
            }`}
          >
            {APP_ENV}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setMessage("");
              }}
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
              placeholder="Enter email"
              autoComplete="email"
              disabled={isCheckingSession || isSigningIn}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Password</label>
            <div className="flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setMessage("");
                }}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={isCheckingSession || isSigningIn}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isCheckingSession || isSigningIn}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {message ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isCheckingSession || isSigningIn}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isCheckingSession ? "Checking Session..." : isSigningIn ? "Signing In..." : "Log In"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-sky-200 hover:text-sky-100"
          >
            Forgot Password?
          </Link>
        </div>

        <div className="mt-6">
          <Link
            href="/"
            className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/10"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}