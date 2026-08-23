"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { APP_ENV, supabase } from "../../lib/supabase";
import { useActiveSeason } from "../../lib/activeSeason";

type AuditRow = {
  id: number;
  environment: "production" | "preview";
  season_year: number;
  coach_id: number;
  coach_name: string;
  admin_email: string;
  action: string;
  reason: string | null;
  created_at: string;
};

export default function AdminTeamsPage() {
  const router = useRouter();
  const { seasonYear, isLoading: isLoadingSeason, error: seasonError } = useActiveSeason();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadAudit = useCallback(async () => {
    if (seasonYear === null) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_team_audit_log")
      .select("id,environment,season_year,coach_id,coach_name,admin_email,action,reason,created_at")
      .eq("environment", APP_ENV)
      .eq("season_year", seasonYear)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setMessage(`Audit log load failed: ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as AuditRow[]);
      setMessage("");
    }
    setLoading(false);
  }, [seasonYear]);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return router.replace("/login");
      const findAdmin = async (environment: string) => supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session!.user.id)
        .eq("environment", environment)
        .eq("role", "admin")
        .maybeSingle();
      const current = await findAdmin(APP_ENV);
      const fallback = !current.data && APP_ENV === "preview" ? await findAdmin("production") : null;
      if (!mounted) return;
      if (!current.data && !fallback?.data) return router.replace("/dashboard");
      await loadAudit();
    }
    void bootstrap();
    return () => { mounted = false; };
  }, [loadAudit, router]);

  if (isLoadingSeason) {
    return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading active season…</main>;
  }

  if (seasonError || seasonYear === null) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-red-200">
        {seasonError ?? "No active season is configured for this environment."}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">{APP_ENV} environment</p>
              <h1 className="mt-2 text-3xl font-bold">Admin Team Audit Log</h1>
              <p className="mt-2 text-sm text-white/70">Latest 100 admin submissions made on behalf of coaches.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void loadAudit()} disabled={loading} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
                {loading ? "Loading..." : "Refresh"}
              </button>
              <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium">Back to Dashboard</Link>
            </div>
          </div>
          {message ? <p className="mt-4 rounded-xl border border-red-300/30 bg-red-950/40 p-3 text-sm text-red-100">{message}</p> : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-white/10 text-xs uppercase tracking-wide text-white/60">
                <tr><th className="p-3">Time</th><th className="p-3">Coach</th><th className="p-3">Admin</th><th className="p-3">Action</th><th className="p-3">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/5">
                    <td className="whitespace-nowrap p-3">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="p-3 font-semibold">{row.coach_name} <span className="text-white/40">#{row.coach_id}</span></td>
                    <td className="p-3">{row.admin_email}</td>
                    <td className="p-3">{row.action.replaceAll("_", " ")}</td>
                    <td className="p-3 text-white/70">{row.reason || "—"}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-white/50">No admin team audit events in {APP_ENV}.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
