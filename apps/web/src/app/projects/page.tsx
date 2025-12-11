import { getProjects } from "../../lib/api";
import { Project } from "../../lib/types";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls = statusColors[status] || "bg-slate-100 text-slate-800";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

export default async function ProjectsPage() {
  const projects: Project[] = await getProjects();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Projects</p>
        <h1 className="text-2xl font-semibold text-slate-900">Projects overview</h1>
        <p className="text-sm text-slate-600">Live data from the Nest API at /projects.</p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No projects yet. Create one via the API (POST /projects) and refresh.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-900">{project.projectName}</div>
                <div className="text-xs text-slate-600">Client: {project.clientName}</div>
                {project.contractorName ? (
                  <div className="text-xs text-slate-600">Contractor: {project.contractorName}</div>
                ) : null}
                <div className="text-xs text-slate-600">Region: {project.region}</div>
                {project.budget ? (
                  <div className="text-xs text-slate-600">Budget: HKD {project.budget}</div>
                ) : null}
                {project.notes ? (
                  <div className="text-xs text-slate-600 line-clamp-2">Notes: {project.notes}</div>
                ) : null}
                <div className="text-xs text-slate-500">ID: {project.id}</div>
              </div>
              <StatusBadge status={project.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
