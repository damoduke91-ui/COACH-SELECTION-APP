import Link from "next/link";
import { COACHES } from "@/lib/coachConfig";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-sm font-medium text-emerald-300">
          Coach Selection App
        </div>

        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
          Weekly AFL team selection for coaches
        </h1>

        <p className="mt-6 max-w-3xl text-base text-slate-300 sm:text-lg">
          Coaches can log in, select their on-field team, order emergencies by
          position, and submit before the weekly deadline.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Go to Login
          </Link>

          <Link
            href="/select-team"
            className="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            View Selection Page
          </Link>
        </div>

        <div className="mt-12 w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-left shadow-2xl">
          <h2 className="text-xl font-bold text-white">Coach setup loaded</h2>
          <p className="mt-2 text-sm text-slate-400">
            The app is now using your real coach list and real team structure.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COACHES.map((coach) => (
              <div
                key={coach.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
              >
                <p className="text-sm font-semibold text-emerald-300">
                  {coach.label}
                </p>
                <h3 className="mt-1 text-lg font-bold">{coach.name}</h3>
                <p className="mt-2 text-xs text-slate-400">
                  On field: 2 KD, 4 DEF, 5 MID, 4 FOR, 2 KF, 1 RUC
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}