"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { APP_ENV, supabase } from "../../lib/supabase";

type LoginSession = {
  userId: string;
  email: string;
  role: "admin" | "coach";
  coachId: number | null;
  coachName: string;
};

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
};

export default function FixturePage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");

  const loadProfileForUser = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, coach_id, coach_name")
      .eq("id", userId)
      .eq("environment", APP_ENV)
      .single();

    if (error) {
      setMessage(`Profile load failed: ${error.message}`);
      return null;
    }

    const profile = data as UserProfileRow | null;

    if (!profile) {
      setMessage("No profile found for this user.");
      return null;
    }

    if (profile.role === "coach" && !profile.coach_id) {
      setMessage("Coach profile is missing coach_id.");
      return null;
    }

    return {
      userId,
      email,
      role: profile.role,
      coachId: profile.coach_id,
      coachName:
        profile.coach_name?.trim() ||
        (profile.role === "admin" ? "Admin" : `Coach ${profile.coach_id ?? ""}`.trim()),
    } satisfies LoginSession;
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      setIsAuthenticating(true);
      setMessage("");

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setMessage(`Session check failed: ${error.message}`);
        setIsAuthenticating(false);
        return;
      }

      if (!session?.user) {
        setLoginSession(null);
        setIsAuthenticating(false);
        router.replace("/login");
        return;
      }

      const nextSession = await loadProfileForUser(session.user.id, session.user.email ?? "");

      if (!isMounted) return;

      if (!nextSession) {
        setLoginSession(null);
        setIsAuthenticating(false);
        router.replace("/login");
        return;
      }

      setLoginSession(nextSession);
      setIsAuthenticating(false);
    }

    void bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!isMounted) return;

        if (!session?.user) {
          setLoginSession(null);
          setIsAuthenticating(false);
          router.replace("/login");
          return;
        }

        const nextSession = await loadProfileForUser(session.user.id, session.user.email ?? "");

        if (!isMounted) return;

        if (!nextSession) {
          setLoginSession(null);
          setIsAuthenticating(false);
          router.replace("/login");
          return;
        }

        setLoginSession(nextSession);
        setIsAuthenticating(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isAuthenticating) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Checking session...</div>
        </div>
      </main>
    );
  }

  if (!loginSession) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Full Season Fixture</h1>
              <p className="mt-2 text-sm text-white/70">
                Signed in as {loginSession.coachName} • {loginSession.role}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Back to Dashboard
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Log Out
              </button>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {message}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-bold">Coming Soon</h2>
          <p className="mt-3 text-sm leading-6 text-white/70">
            This page will become the full season fixture page. For now it is a placeholder so the
            navigation structure is in place and ready for the real build later.
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            Planned future content:
            <div className="mt-2">- full round-by-round fixture</div>
            <div>- current round highlight</div>
            <div>- next round preview</div>
            <div>- admin-editable fixture data</div>
          </div>
        </section>
      </div>
    </main>
  );
}