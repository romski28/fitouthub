import Link from 'next/link';
import changelogData from '@/data/admin-changelog.json';

export const dynamic = 'force-dynamic';

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

type HealthStatus = 'active' | 'warn' | 'stale';

function getHookHealth(entries: ChangelogEntry[]): {
  status: HealthStatus;
  daysSince: number;
  lastDate: string;
} {
  if (entries.length === 0) return { status: 'stale', daysSince: Infinity, lastDate: '' };
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const lastDate = sorted[0].date;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSince = (Date.now() - new Date(lastDate).getTime()) / msPerDay;
  const status: HealthStatus = daysSince <= 3 ? 'active' : daysSince <= 14 ? 'warn' : 'stale';
  return { status, daysSince: Math.floor(daysSince), lastDate };
}

export default function AdminChangelogPage() {
  const entries = [...(changelogData as ChangelogEntry[])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const health = getHookHealth(entries);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">Release Notes</p>
            <h1 className="mt-1 text-2xl font-bold">Admin Changelog</h1>
            <p className="mt-1 text-sm text-slate-200">
              Dated internal changes across the platform. This feed helps product, ops, and QA track what changed.
            </p>
          </div>
          {/* Automation health badge */}
          {health.status === 'active' ? (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Automation active
            </span>
          ) : health.status === 'warn' ? (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              {health.daysSince}d since last entry
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-inset ring-red-500/30">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
              {health.daysSince === Infinity ? 'No entries' : `${health.daysSince}d since last entry`}
            </span>
          )}
        </div>
      </div>

      {/* Automation warning banner */}
      {health.status === 'warn' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Hook may be inactive.</span> Last changelog entry was {health.daysSince} day{health.daysSince !== 1 ? 's' : ''} ago
            {health.lastDate ? ` (${formatDate(health.lastDate)})` : ''}.
            Run <code className="rounded bg-amber-100 px-1 font-mono text-xs">pnpm hooks:install</code> in the repo root to restore automation.
          </div>
        </div>
      )}
      {health.status === 'stale' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-red-800">
            <span className="font-semibold">Hook appears inactive.</span>{' '}
            {health.daysSince === Infinity
              ? 'No changelog entries found.'
              : `No entries in ${health.daysSince} days (last: ${formatDate(health.lastDate)}).`}{' '}
            Run <code className="rounded bg-red-100 px-1 font-mono text-xs">pnpm hooks:install</code> in the repo root to restore automation.
          </div>
        </div>
      )}

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
