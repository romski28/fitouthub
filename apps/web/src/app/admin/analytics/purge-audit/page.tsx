'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { toast } from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';

interface PurgeAuditEntry {
  id: string;
  actorName: string;
  details: string;
  status: string;
  createdAt: string;
  resourceId: string; // former project ID
  metadata?: {
    projectId?: string;
    projectName?: string;
    impact?: Record<string, number>;
    totalRecords?: number;
    filesCleanedUp?: number;
    purgedAt?: string;
  };
  user?: { firstName: string; surname: string; email: string } | null;
}

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function humanKey(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export default function PurgeAuditPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<PurgeAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const limit = 20;

  const loadLogs = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/admin/purge-audit?page=${page}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toast.error('Failed to load purge audit log');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/admin/analytics" className="hover:underline">
              Analytics
            </Link>
            <span>/</span>
            <span className="text-slate-700 font-medium">Purge Audit Log</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Purge Audit Log</h1>
          <p className="mt-2 text-slate-600">
            Permanent record of every project that has been hard-deleted by an admin, including the
            exact blast radius — tables affected, record counts, and files removed.
          </p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <strong>{total}</strong> project purge{total !== 1 ? 's' : ''} on record
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-rose-500" />
            <p className="mt-4 text-slate-500">Loading purge audit log…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <svg
              className="mb-3 h-10 w-10 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            No projects have been permanently deleted yet
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Project</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Deleted by</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Records</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Files</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">When</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((entry) => {
                    const meta = entry.metadata ?? {};
                    const impact = meta.impact ?? {};
                    const sortedImpact = Object.entries(impact)
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a);
                    const isExpanded = expandedIds[entry.id] ?? false;

                    return (
                      <React.Fragment key={entry.id}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {meta.projectName ?? '—'}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                              {entry.resourceId}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {entry.user
                              ? `${entry.user.firstName} ${entry.user.surname}`
                              : entry.actorName}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {(meta.totalRecords ?? 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {meta.filesCleanedUp ?? 0}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {timeAgo(entry.createdAt)}
                            <span className="ml-1 text-[10px] text-slate-400 hidden sm:inline">
                              {new Date(entry.createdAt).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {sortedImpact.length > 0 && (
                              <button
                                onClick={() => toggleExpand(entry.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                {sortedImpact.length} table{sortedImpact.length !== 1 ? 's' : ''}
                                <svg
                                  className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expandable impact grid */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-slate-50 px-4 py-4">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Blast radius — records removed per table
                              </p>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                {sortedImpact.map(([key, count]) => (
                                  <div
                                    key={key}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm"
                                  >
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {humanKey(key)}
                                    </p>
                                    <p className="text-base font-semibold text-slate-900">
                                      {count.toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-sm text-slate-500">
                  Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-400">
        These records are permanent and immutable. They are written to the Activity Log with{' '}
        <code className="rounded bg-slate-100 px-1 font-mono">action = project_purged</code> and
        survive independently of the deleted project data.
      </p>
    </div>
  );
}
