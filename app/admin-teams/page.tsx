import Link from "next/link";

export default function AdminTeamsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Admin Teams</h1>
              <p className="mt-2 text-sm text-white/70">
                This page is now restored so production deployments can build successfully.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-6">
          <h2 className="text-lg font-semibold text-amber-200">Admin teams page placeholder</h2>
          <p className="mt-2 text-sm text-amber-100/80">
            This file was empty, which caused the Vercel production deployment to fail.
            You can now redeploy safely, and we can rebuild the full admin teams screen next.
          </p>
        </section>
      </div>
    </main>
  );
}