"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

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
  const [loginError, setLoginError] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        setLoginError(`Session check failed: ${error.message}`);
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
        .single();

      if (!isMounted) return;

      if (profileError || !profile) {
        setLoginError(
          `Profile load failed: ${profileError?.message ?? "No profile found for this user."}`
        );
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

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setLoginError("Enter your email.");
      return;
    }

    if (!password) {
      setLoginError("Enter your password.");
      return;
    }

    setLoginError("");
    setIsSubmitting(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setLoginError(`Login failed: ${error.message}`);
      setIsSubmitting(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setLoginError("Login succeeded, but no user was returned.");
      setIsSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, coach_id, coach_name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setLoginError(
        `Profile load failed: ${profileError?.message ?? "No profile found for this user."}`
      );
      await supabase.auth.signOut();
      setIsSubmitting(false);
      return;
    }

    const typedProfile = profile as UserProfileRow;

    if (typedProfile.role === "coach" && !typedProfile.coach_id) {
      setLoginError("Coach profile is missing coach_id.");
      await supabase.auth.signOut();
      setIsSubmitting(false);
      return;
    }

    router.replace("/select-team");
    router.refresh();
  }

  if (isCheckingSession) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
            <h1 className="text-2xl font-semibold">Coach Login</h1>
            <p className="mt-3 text-sm text-slate-400">Checking your session...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl md:grid-cols-2">
          <div className="flex flex-col justify-center bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 p-8 md:p-12">
            <div className="inline-flex w-fit rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-emerald-100">
              Coaches Portal
            </div>

            <h1 className="mt-6 text-3xl font-bold sm:text-4xl">
              Login to submit your weekly team
            </h1>

            <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50/85 sm:text-base">
              Coaches will log in here, select their team for the round, order
              emergencies by position, and submit before the weekly deadline.
            </p>
          </div>

          <div className="flex items-center justify-center p-8 md:p-12">
            <div className="w-full max-w-md">
              <h2 className="text-2xl font-semibold">Coach Login</h2>
              <p className="mt-2 text-sm text-slate-400">
                Sign in with your Supabase Auth email and password.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setLoginError("");
                    }}
                    placeholder="coach@email.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setLoginError("");
                      }}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {loginError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {loginError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Logging in..." : "Login"}
                </button>
              </form>

              <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
                <Link href="/" className="hover:text-white">
                  Back to Home
                </Link>

                <Link href="/select-team" className="hover:text-white">
                  Go to Selection Page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}