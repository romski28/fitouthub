import Link from "next/link";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="space-y-3 rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-6">
          <p className="text-sm uppercase tracking-wide text-emerald-300">Docs &amp; Tools</p>
          <h1 className="text-3xl font-bold">Guides, calculators, and practical helpers</h1>
          <p className="max-w-3xl text-slate-300">
            One home for your FitoutHub reference material and homeowner-friendly helper tools.
            Start with a guide, or jump straight into the first live helper: the AC calculator.
          </p>
        </header>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Guides</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Documentation</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/docs/user-manual" className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 transition hover:border-emerald-400 hover:bg-slate-900">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">User manual</p>
              <h3 className="mt-2 text-xl font-semibold text-white">FitoutHub User Manual</h3>
              <p className="mt-2 text-sm text-slate-300">The operational reference for the platform, API basics, environment setup, and troubleshooting.</p>
            </Link>
            <Link href="/docs/how-to-use" className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 transition hover:border-emerald-400 hover:bg-slate-900">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Walkthrough</p>
              <h3 className="mt-2 text-xl font-semibold text-white">How to Use FitoutHub</h3>
              <p className="mt-2 text-sm text-slate-300">A simpler start-here guide for browsing professionals, creating projects, and managing invites.</p>
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-300">Tools</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Practical homeowner helpers</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/docs/tools/ac-calculator" className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-5 transition hover:border-sky-400 hover:from-slate-900 hover:to-slate-700">
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-300">Helper tool #1</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Hong Kong AC Calculator</h3>
              <p className="mt-2 text-sm text-slate-300">Estimate room-by-room BTU demand, suggested unit sizes, multi-split suitability, and an initial compressor direction.</p>
            </Link>
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Coming soon</p>
              <h3 className="mt-2 text-xl font-semibold text-white">More planning helpers</h3>
              <p className="mt-2 text-sm text-slate-400">This section is ready for future homeowner tools that can later connect into formal projects.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
