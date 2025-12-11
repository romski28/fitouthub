const features = [
  {
    title: "Browse Professionals",
    description: "Discover vetted contractors, companies, and resellers with verified ratings and service coverage.",
    href: "/professionals",
    icon: "🏢",
  },
  {
    title: "Manage Projects",
    description: "Track your fitout projects from start to finish with real-time status updates.",
    href: "/projects",
    icon: "📋",
  },
  {
    title: "Join as Pro",
    description: "Register your business and connect with clients looking for your expertise.",
    href: "/join",
    icon: "⭐",
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Content */}
          <div className="p-8 lg:p-12 space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-400 mb-2">
                Welcome to Fitout Hub
              </p>
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
                Find the Right Professionals for Your Fitout
              </h1>
            </div>
            <p className="text-lg text-slate-300">
              Connect with trusted contractors, companies, and resellers. Manage your renovation projects with ease and confidence.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white hover:bg-emerald-700 transition"
                href="/professionals"
              >
                Browse Professionals
              </a>
              <a
                className="rounded-lg border border-white px-6 py-3 text-base font-semibold text-white hover:bg-white hover:text-slate-900 transition"
                href="/join"
              >
                Join as Professional
              </a>
            </div>
          </div>

          {/* Hero Image */}
          <div className="h-96 lg:h-full bg-cover bg-center hidden lg:block" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 400 400%27%3E%3Cdefs%3E%3ClinearGradient id=%27grad%27 x1=%270%25%27 y1=%270%25%27 x2=%27100%25%27 y2=%27100%25%27%3E%3Cstop offset=%270%25%27 style=%27stop-color:%2310b981;stop-opacity:1%27 /%3E%3Cstop offset=%27100%25%27 style=%27stop-color:%23059669;stop-opacity:1%27 /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill=%27url(%23grad)%27 width=%27400%27 height=%27400%27/%3E%3Ccircle cx=%27200%27 cy=%27200%27 r=%2780%27 fill=%27rgba(255,255,255,0.1)%27/%3E%3Ccircle cx=%27200%27 cy=%27200%27 r=%2750%27 fill=%27rgba(255,255,255,0.2)%27/%3E%3C/svg%3E")'
          }} />
        </div>
      </section>

      {/* Features Section */}
      <section className="space-y-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">
            How it Works
          </p>
          <h2 className="text-3xl font-bold text-slate-900">Everything You Need</h2>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
            A complete platform to find professionals, manage projects, and grow your business.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((item) => (
            <a
              key={item.title}
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              href={item.href}
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-lg font-semibold text-slate-900 group-hover:text-emerald-600 transition">
                {item.title}
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
