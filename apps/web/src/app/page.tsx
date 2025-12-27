import SearchFlow from '@/components/search-flow';

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
      {/* Search Flow */}
      <section className="relative -mx-6 -mt-10 bg-gradient-to-b from-emerald-50 to-white px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600 mb-2">
              Quick Start
            </p>
            <h2 className="text-2xl font-bold text-slate-900">
              Tell us what you need
            </h2>
          </div>
          <SearchFlow />
        </div>
      </section>

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
          </div>

          {/* Hero Image */}
          <div className="h-96 lg:h-full bg-cover bg-center hidden lg:block" style={{
            backgroundImage: 'url("/hero-painter.svg")'
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
