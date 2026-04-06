"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type RequestState = "idle" | "sending" | "sent" | "error";

function getResetRedirectUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/reset-password`;
  }

  return "https://coach-selection-app.vercel.app/reset-password";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  const trimmedEmail = useMemo(() => email.trim(), [email]);
  const canSubmit = trimmedEmail.length > 0 && status !== "sending";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedEmail) {
      setStatus("error");
      setMessage("Enter your email address.");
      return;
    }

    setStatus("sending");
    setMessage("Sending password reset email...");

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: getResetRedirectUrl(),
    });

    if (error) {
      setStatus("error");
      setMessage(`Failed to send password reset email: ${error.message}`);
      return;
    }

    setStatus("sent");
    setMessage(
      `Password reset email sent to ${trimmedEmail}. Open the newest email and follow the link to reset your password.`
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-3xl font-bold">Forgot Password</h1>
        <p className="mt-2 text-sm text-white/70">
          Enter your email address and we&apos;ll send you a password reset link.
        </p>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
          Reset links from this page will send you to:
          <div className="mt-2 break-all text-xs text-sky-200">{getResetRedirectUrl()}</div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status !== "sending") {
                  setStatus("idle");
                  setMessage("");
                }
              }}
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
              placeholder="Enter your email"
              autoComplete="email"
              disabled={status === "sending"}
            />
          </div>

          {message ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                status === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : status === "sent"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 bg-black/20 text-white/85"
              }`}
            >
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "sending" ? "Sending..." : "Send Reset Email"}
          </button>
        </form>

        <div className="mt-6">
          <Link
            href="/login"
            className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/10"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
