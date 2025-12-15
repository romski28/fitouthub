import Link from "next/link";

const Step = ({ title, items }: { title: string; items: string[] }) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold">{title}</h2>
    <ul className="list-disc pl-5 space-y-1 text-slate-700">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </section>
);

export default function HowToUsePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-neutral-500">How to</p>
        <h1 className="text-3xl font-bold">How to Use FitoutHub</h1>
        <p className="text-neutral-600">
          A quick guide for new users: finding contractors, creating accounts, and managing projects.
          For the full manual, see <Link href="/docs" className="underline">Docs</Link> or the
          <Link href="https://github.com/romski28/fitouthub/blob/main/docs/user-manual.md" className="underline ml-1">markdown version</Link>.
        </p>
      </header>

      <Step
        title="1) Browse and find professionals"
        items={[
          "Go to Tradesmen to explore trade categories and descriptions.",
          "Use Professionals to browse companies/contractors/resellers; filter and open profiles for details.",
          "Copy contact info or proceed to invite them via a project once logged in.",
        ]}
      />

      <Step
        title="2) Create an account"
        items={[
          "Click Join in the top-right.",
          "Fill in your details; confirm email if required.",
          "Login any time via the Login button (top-right).",
        ]}
      />

      <Step
        title="3) Create and manage projects"
        items={[
          "After login, open Projects from the navigation.",
          "Create a project with basic info (name, region, budget, notes).",
          "View your project list; open a project to see details and any invited professionals.",
        ]}
      />

      <Step
        title="4) Invite professionals"
        items={[
          "From a project detail page, invite professionals to respond (quote/accept).",
          "Invited professionals appear under the project; track their status (pending/accepted/declined/quoted).",
        ]}
      />

      <Step
        title="5) Profile and professional info"
        items={[
          "Use Profile to update your account details.",
          "If you are a professional, use Edit Professional Info to update trades, service areas, and contact details.",
        ]}
      />

      <Step
        title="6) Patterns (admin)"
        items={[
          "Admins can review Patterns: core patterns (built-in) and DB patterns (editable).",
          "Patterns help map user intents/keywords to trades or services.",
        ]}
      />

      <Step
        title="7) Troubleshooting"
        items={[
          "If data looks empty, ensure you are logged in and the API is reachable.",
          "If patterns or users are missing, the deployment may still be propagating—refresh after a minute.",
          "For support, check Docs or contact the admin team.",
        ]}
      />
    </main>
  );
}
