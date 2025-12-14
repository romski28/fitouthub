export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Policy</p>
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="text-slate-600">Last updated: Placeholder date. Replace with your official policy language.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">1. Information we collect</h2>
        <p className="text-slate-700">
          Describe the personal and usage data collected from professionals, clients, and visitors. Include account data,
          project metadata, device information, and cookies/analytics.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">2. How we use information</h2>
        <p className="text-slate-700">
          Outline purposes like providing services, matching professionals to projects, communications, security,
          analytics, and improving the platform. Clarify lawful bases where applicable.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">3. Sharing and disclosures</h2>
        <p className="text-slate-700">
          Note when data may be shared (e.g., with project participants, service providers, legal compliance). Clarify no
          sale of personal data and include subprocessors once finalized.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">4. Data retention and security</h2>
        <p className="text-slate-700">
          State retention timelines or criteria, and summarize security practices (encryption in transit, access control,
          monitoring). Add incident response language when available.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">5. Your rights</h2>
        <p className="text-slate-700">
          Provide guidance on access, correction, deletion, and export requests. Mention how to submit requests and
          verification steps. Localize for your jurisdictions (e.g., GDPR/CCPA) during refinement.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">6. Contact</h2>
        <p className="text-slate-700">
          Add official contact channels for privacy questions. A dedicated email and postal address should be included in
          the final version.
        </p>
      </section>
    </div>
  );
}
