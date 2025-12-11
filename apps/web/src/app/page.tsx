const features = [
  {
    title: "Browse trades",
    description: "See all tradesmen by specialty and service areas.",
    href: "/tradesmen",
  },
  {
    title: "Find professionals",
    description: "Contractors and resellers with ratings and service coverage.",
    href: "/professionals",
  },
  {
    title: "Manage projects",
    description: "Track renovation projects and statuses.",
    href: "/projects",
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Fitout Hub
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-slate-900">
            Find the right trades and professionals for every fitout project.
          </h1>
          <p className="text-base text-slate-600">
            Start by browsing tradesmen, comparing professionals, then tracking your projects. No sign-in required for this preview.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              href="/tradesmen"
            >
              View tradesmen
            </a>
            <a
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400"
              href="/professionals"
            >
              See professionals
            </a>
            <a
              className="rounded-full border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              href="/join"
            >
              Join as professional
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((item) => (
          <a
            key={item.title}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
            href={item.href}
          >
            <div className="text-base font-semibold text-slate-900 group-hover:text-slate-800">
              {item.title}
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
          </a>
        ))}
      </section>
    </div>
  );
}
