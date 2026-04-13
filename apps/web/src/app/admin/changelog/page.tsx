import Link from 'next/link';
import changelogData from '@/data/admin-changelog.json';

type ChangelogEntry = {
  id: string;
  date: string;
  title: string;
  summary: string;
  areas?: string[];
  commit?: string;
  files?: string[];
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function AdminChangelogPage() {
  const entries = [...(changelogData as ChangelogEntry[])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">Release Notes</p>
        <h1 className="mt-1 text-2xl font-bold">Admin Changelog</h1>
        <p className="mt-1 text-sm text-slate-200">
          Dated internal changes across the platform. This feed helps product, ops, and QA track what changed.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No changelog entries yet.
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{entry.title}</h2>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{formatDate(entry.date)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(entry.areas || []).map((area) => (
                    <span key={`${entry.id}-${area}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {area}
                    </span>
                  ))}
                  {entry.commit ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {entry.commit}
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-700">{entry.summary}</p>

              {entry.files && entry.files.length > 0 ? (
                <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    Changed files ({entry.files.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {entry.files.map((file) => (
                      <li key={`${entry.id}-${file}`} className="truncate">{file}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p>
          Tip: run <code className="font-mono">pnpm hooks:install</code> in repo root to install local git hook automation for changelog entries.
        </p>
        <p className="mt-1">
          Back to <Link href="/admin?tab=data-control" className="font-semibold text-emerald-700 hover:text-emerald-800">Data Control</Link>.
        </p>
      </div>
    </div>
  );
}
