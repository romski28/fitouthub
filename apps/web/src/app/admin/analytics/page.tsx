import React from "react";

const metrics = [
  { label: "Professionals approved", value: 128, delta: "+12 this week" },
  { label: "Projects created", value: 64, delta: "+8 this week" },
  { label: "Active users", value: 412, delta: "+5% vs last week" },
  { label: "Quote requests", value: 92, delta: "+14 this week" },
];

const trendSeries = [
  { label: "Approvals", values: [8, 12, 10, 14, 16, 18, 20] },
  { label: "Projects", values: [6, 9, 7, 10, 11, 13, 12] },
];

const activityBreakdown = [
  { label: "Bulk approvals", value: 18 },
  { label: "Profile edits", value: 46 },
  { label: "Suspensions", value: 4 },
  { label: "Deletions", value: 3 },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-2 text-slate-600">
          Quick snapshot of approvals, projects, and engagement. Replace placeholder data with live API metrics when ready.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</p>
            <p className="mt-1 text-xs font-medium text-green-600">{metric.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Weekly trend (placeholder)</h2>
              <p className="text-sm text-slate-600">Mock data for approvals and projects. Wire to API later.</p>
            </div>
            <span className="text-xs text-slate-500">Last 7 days</span>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-3">
            {trendSeries[0].values.map((_, idx) => {
              const approvals = trendSeries[0].values[idx];
              const projects = trendSeries[1].values[idx];
              const max = Math.max(
                ...trendSeries[0].values,
                ...trendSeries[1].values
              );
              return (
                <div key={idx} className="flex flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end gap-2 rounded bg-slate-50 p-2">
                    <div
                      className="w-1/2 rounded-t bg-indigo-500"
                      style={{ height: `${(approvals / max) * 100}%` }}
                    />
                    <div
                      className="w-1/2 rounded-t bg-emerald-500"
                      style={{ height: `${(projects / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">D{idx + 1}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-2 w-4 rounded bg-indigo-500" /> Approvals
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-4 rounded bg-emerald-500" /> Projects
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Activity breakdown</h2>
          <p className="text-sm text-slate-600">Placeholder distribution of recent admin actions.</p>
          <div className="mt-4 space-y-3">
            {activityBreakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{item.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-indigo-500" style={{ width: `${Math.min(item.value * 4, 100)}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Next steps</h2>
          <span className="text-xs text-slate-500">Implementation notes</span>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Replace static arrays with API data (professionals, projects, approvals, suspensions).</li>
          <li>Add time range filters and sparklines per metric.</li>
          <li>Consider downloadable CSV and drill-through to filtered lists.</li>
        </ul>
      </div>
    </div>
  );
}
