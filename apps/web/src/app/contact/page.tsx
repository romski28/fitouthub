import Image from "next/image";

const channels = [
  {
    team: "Support",
    description: "Help with accounts, billing, and general platform questions.",
    methods: [
      { label: "Email", value: "support@fitouthub.com", icon: "/assets/images/email.svg" },
      { label: "Live chat", value: "Available 09:00-18:00", icon: "/assets/images/email.svg" },
      { label: "WhatsApp", value: "+44 20 7946 0000", icon: "/assets/images/phone.svg" },
    ],
  },
  {
    team: "Technical",
    description: "Integration issues, bugs, uptime, and API questions.",
    methods: [
      { label: "Email", value: "tech@fitouthub.com", icon: "/assets/images/email.svg" },
      { label: "Live chat", value: "Priority for incidents", icon: "/assets/images/email.svg" },
      { label: "WhatsApp", value: "+44 20 7946 1111", icon: "/assets/images/phone.svg" },
    ],
  },
  {
    team: "Partnerships",
    description: "New partnerships, enterprise fitouts, and co-marketing.",
    methods: [
      { label: "Email", value: "partners@fitouthub.com", icon: "/assets/images/email.svg" },
      { label: "Live chat", value: "Schedule a call", icon: "/assets/images/email.svg" },
      { label: "WhatsApp", value: "+44 20 7946 2222", icon: "/assets/images/phone.svg" },
    ],
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Contact</p>
        <h1 className="text-3xl font-bold text-slate-900">Talk with the right team</h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Choose the channel that suits you—email for detailed requests, live chat for quick questions, or WhatsApp when
          you are on the move. We will route you to the right experts.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => (
          <div key={channel.team} className="rounded-xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur-sm p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{channel.team}</h2>
                <p className="text-sm text-slate-600">{channel.description}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-indigo-100" aria-hidden />
            </div>

            <div className="space-y-3">
              {channel.methods.map((method) => (
                <div key={method.label} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-white shadow-sm">
                    <Image src={method.icon} alt={method.label} fill className="object-contain p-2" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{method.label}</p>
                    <p className="text-sm text-slate-600">{method.value}</p>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-slate-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 4.293a1 1 0 011.414 0L13 8.586a2 2 0 010 2.828l-4.293 4.293a1 1 0 11-1.414-1.414L10.586 10 7.293 6.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-900">Prefer a quick note?</h3>
            <p className="text-slate-600">Drop us a line and we will route it to the best team.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:hello@fitouthub.com"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Email us
            </a>
            <a
              href="https://wa.me/442079460000"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:border-indigo-300"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
