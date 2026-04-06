"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type RecoveryState = "checking" | "ready" | "invalid" | "saving" | "success";

function getHashParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return new URLSearchParams(hash);
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<RecoveryState>("checking");
  const [message, setMessage] = useState("Checking your password reset link...");

  const passwordsMatch = useMemo(() => password === confirmPassword, [password, confirmPassword]);
  const passwordLongEnough = password.trim().length >= 8;

  useEffect(() => {
    let isMounted = true;

    async function prepareRecoverySession() {
      const hashParams = getHashParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");

      if (!accessToken || !refreshToken || type !== "recovery") {
        if (!isMounted) return;
        setStatus("invalid");
        setMessage("This password reset link is invalid or has expired. Request a new reset email.");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!isMounted) return;

      if (error) {
        setStatus("invalid");
        setMessage(`This password reset link could not be verified: ${error.message}`);
        return;
      }

      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      setStatus("ready");
      setMessage("Enter your new password below.");
    }

    void prepareRecoverySession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status !== "ready") return;

    if (!passwordLongEnough) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (!passwordsMatch) {
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("saving");
    setMessage("Updating password...");

    const { error } = await supabase.auth.updateUser({
      password: password.trim(),
    });

    if (error) {
      setStatus("ready");
      setMessage(`Password update failed: ${error.message}`);
      return;
    }

    setStatus("success");
    setMessage("Password updated successfully. Redirecting to login...");

    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  const submitDisabled =
    status !== "ready" || !passwordLongEnough || !passwordsMatch || !password;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-3xl font-bold">Reset Password</h1>
        <p className="mt-2 text-sm text-white/70">
          Set a new password for your Coach Selection App account.
        </p>

        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            status === "invalid"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : status === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-white/10 bg-black/20 text-white/85"
          }`}
        >
          {message}
        </div>

        {status === "ready" || status === "saving" ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                placeholder="Enter new password"
                autoComplete="new-password"
                disabled={status === "saving"}
              />
              <p className="mt-2 text-xs text-white/50">Use at least 8 characters.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                placeholder="Confirm new password"
                autoComplete="new-password"
                disabled={status === "saving"}
              />
            </div>

            {!passwordLongEnough && password.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Password must be at least 8 characters.
              </div>
            ) : null}

            {!passwordsMatch && confirmPassword.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Passwords do not match.
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "saving" ? "Saving..." : "Save New Password"}
            </button>
          </form>
        ) : null}

        {(status === "invalid" || status === "success") && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
