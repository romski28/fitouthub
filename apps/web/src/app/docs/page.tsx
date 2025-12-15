import Link from "next/link";

const section = (title: string, items: string[]) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold">{title}</h2>
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </section>
);

export default function DocsPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-neutral-500">Docs</p>
        <h1 className="text-3xl font-bold">FitoutHub User Manual</h1>
        <p className="text-neutral-600">
          Quick reference for admins and team members. For the full markdown
          version, see the repo file in <Link href="https://github.com/romski28/fitouthub/blob/main/docs/user-manual.md" className="underline">docs/user-manual.md</Link>. For a step-by-step user walkthrough, see <Link href="/docs/how-to-use" className="underline">How to Use</Link>.
        </p>
      </header>

      {section("Overview", [
        "Collect renovation projects and manage professionals/companies/resellers.",
        "Admin views for reviewing data and patterns; REST API backs the frontend.",
      ])}

      {section("Access", [
        "Web (Vercel): Admin pages and frontend UI.",
        "API (Render): https://fitouthub.onrender.com",
      ])}

      {section("Admin Features", [
        "Professionals: list, filter, view detail.",
        "Projects: list, view detail.",
        "Users: list (once API route is live after deploy).",
        "Patterns: core + DB patterns (after migration runs).",
      ])}

      {section("Key API Endpoints", [
        "GET /projects — list projects; /projects/:id — detail; /projects/:id/professionals — linked pros.",
        "GET /tradesmen — reference trades.",
        "GET /professionals — list professionals (filters supported).",
        "GET /users — list users (after deploy).",
        "GET /patterns?includeCore=true — core + DB patterns (after migration).",
        "Auth (if enabled): POST /auth/login, POST /auth/register.",
      ])}

      {section("Environment Config", [
        "Frontend (Vercel): NEXT_PUBLIC_API_BASE_URL=https://fitouthub.onrender.com.",
        "API (Render): DATABASE_URL with pooler port 5432 and pgbouncer params; JWT secrets; RESEND_API_KEY; BASE_URL.",
        "Local: API pnpm start:dev (3001); Web pnpm dev (3000); NEXT_PUBLIC_API_BASE_URL=http://localhost:3001.",
      ])}

      {section("Common Tasks", [
        "Run API locally: cd apps/api && pnpm start:dev.",
        "Run Web locally: cd apps/web && pnpm dev.",
        "Run migrations locally: cd apps/api && pnpm exec prisma migrate deploy.",
        "Seed (if needed): pnpm run seed:professionals, pnpm run seed:patterns (apps/api).",
      ])}

      {section("Troubleshooting", [
        "Patterns/Users 404 on Render: redeploy with migrations (pnpm --filter=api exec prisma migrate deploy during build).",
        "DB connection issues: use pooler host/port 5432 with pgbouncer=true&connection_limit=1.",
        "Missing module on Render: ensure pnpm install runs at root before build.",
      ])}
    </main>
  );
}
