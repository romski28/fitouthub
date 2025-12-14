import React from "react";

const activity = [
  {
    id: 1,
    actor: "Alex Chen",
    action: "Bulk approved 12 professionals",
    target: "Professionals",
    timestamp: "Today, 09:12",
    status: "success",
  },
  {
    id: 2,
    actor: "Priya Patel",
    action: "Edited profile",
    target: "Pro: GreenBuild Co.",
    timestamp: "Today, 08:47",
    status: "info",
  },
  {
    id: 3,
    actor: "Alex Chen",
    action: "Exported CSV",
    target: "Professionals (42 rows)",
    timestamp: "Yesterday, 17:05",
    status: "info",
  },
  {
    id: 4,
    actor: "Sam Lee",
    action: "Suspended account",
    target: "Pro: Rapid Roofing",
    timestamp: "Yesterday, 11:32",
    status: "warning",
  },
  {
    id: 5,
    actor: "Alex Chen",
    action: "Deleted project",
    target: "Project: Midtown Loft",
    timestamp: "2d ago",
    status: "danger",
  },
];

const statusStyles: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
};

export default function ActivityLogPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Activity Log</h1>
        <p className="mt-2 text-slate-600">
          Audit trail of admin actions. Replace placeholder entries with real events from the API.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent activity (placeholder)</h2>
            <p className="text-sm text-slate-600">Add filters for actor, status, date, and resource when wired to data.</p>
          </div>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Export log
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-200">
          {activity.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-slate-300" />
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
                    <span className="font-semibold">{item.actor}</span>
                    <span className="text-slate-500">{item.action}</span>
                    <span className="text-slate-700">· {item.target}</span>
                  </div>
                  <p className="text-xs text-slate-500">{item.timestamp}</p>
                </div>
              </div>
              <span className={`self-start rounded-full px-2 py-1 text-xs font-medium ${statusStyles[item.status]}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Next steps</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Connect to audit log API (actor, verb, resource, timestamp, metadata).</li>
          <li>Add filters (date range, actor, resource type, status) and pagination.</li>
          <li>Support export (CSV/JSON) and drill-through to the affected record.</li>
        </ul>
      </div>
    </div>
  );
}
