import Link from "next/link";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[rgba(248,244,232,0.6)] text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 rounded-3xl">
        <header className="space-y-3 rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-6 shadow-[0_18px_40px_rgba(81,55,32,0.06)]">
          <p className="text-sm uppercase tracking-wide text-emerald-700">Docs &amp; Tools</p>
          <h1 className="text-3xl font-bold">Guides, calculators, and practical helpers</h1>
          <p className="max-w-3xl text-slate-700">
            One home for your FitoutHub reference material and homeowner-friendly helper tools.
            Start with a guide, or jump straight into the first live helper: the AC calculator.
          </p>
        </header>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Guides</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Documentation</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Link href="/docs/user-manual" className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-5 transition hover:border-emerald-400 hover:bg-[rgba(245,238,219,0.95)]">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">User manual</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">FitoutHub User Manual</h3>
              <p className="mt-2 text-sm text-slate-700">The operational reference for the platform, API basics, environment setup, and troubleshooting.</p>
            </Link>
            <Link href="/docs/how-to-use" className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-5 transition hover:border-emerald-400 hover:bg-[rgba(245,238,219,0.95)]">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Walkthrough</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">How to Use FitoutHub</h3>
              <p className="mt-2 text-sm text-slate-700">A simpler start-here guide for browsing professionals, creating projects, and managing invites.</p>
            </Link>
            <Link href="/tradesmen" className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-5 transition hover:border-emerald-400 hover:bg-[rgba(245,238,219,0.95)]">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Learn more</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Tradesmen and women</h3>
              <p className="mt-2 text-sm text-slate-700">Get to know more about the trades that work together to deliver your projects, large and small.</p>
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-700">Tools</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Practical homeowner helpers</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/docs/tools/ac-calculator" className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-5 transition hover:border-sky-400 hover:bg-[rgba(245,238,219,0.95)]">
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Helper tool #1</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Hong Kong AC Calculator</h3>
              <p className="mt-2 text-sm text-slate-700">Estimate room-by-room BTU demand, suggested unit sizes, multi-split suitability, and an initial compressor direction.</p>
            </Link>
            <Link href="/docs/tools/paint-calculator" className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-5 transition hover:border-sky-400 hover:bg-[rgba(245,238,219,0.95)]">
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Helper tool #2</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Paint Quantity Calculator</h3>
              <p className="mt-2 text-sm text-slate-700">Estimate wall-paint quantity by room dimensions, opening deductions, and number of coats.</p>
            </Link>
            <div className="rounded-2xl border border-dashed border-[rgba(120,53,15,0.22)] bg-[rgba(245,238,219,0.55)] p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Helper tool #3</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Electrical Load Estimator</h3>
              <p className="mt-2 text-sm text-slate-700">Plan circuit demand across rooms and major appliances for an early sizing check.</p>
              <span className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Coming soon!
              </span>
            </div>
            <div className="rounded-2xl border border-dashed border-[rgba(120,53,15,0.22)] bg-[rgba(245,238,219,0.55)] p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Helper tool #4</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Tile Quantity Calculator</h3>
              <p className="mt-2 text-sm text-slate-700">Estimate tile counts, wastage allowance, and box totals for floors and walls.</p>
              <span className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Coming soon!
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
