'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type ConvLogRow = {
  id: string;
  sessionId: string;
  turn: number;
  role: string;
  projectId: string | null;
  aiIntakeId: string | null;
  prompt: string | null;
  userResponse: string | null;
  safetyJson: any;
  metadata: any;
  createdAt: string;
};

type ConvLogListResponse = {
  logs: ConvLogRow[];
  total: number;
  skip: number;
  take: number;
};

type SessionGroup = {
  sessionId: string;
  turns: ConvLogRow[];
  projectId: string | null;
  firstAt: string;
  lastAt: string;
  safetyLevel: string | null;
};

export default function ConversationLogsPage() {
  const { accessToken, user, isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConvLogListResponse | null>(null);
  const [filter, setFilter] = useState<{ projectId?: string; sessionId?: string }>({});
  const [filterInput, setFilterInput] = useState({ projectId: '', sessionId: '' });
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const take = 250;

  const fetchLogs = async (newSkip: number) => {
    if (!accessToken || user?.role !== 'admin') {
      setError('Admin access required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(newSkip));
      params.set('take', String(take));
      if (filter.projectId) params.set('projectId', filter.projectId);
      if (filter.sessionId) params.set('sessionId', filter.sessionId);

      const res = await fetch(`${API_BASE_URL}/ai/admin/conversation-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      setData(json);
      setSkip(json.skip);
    } catch (err: any) {
      setError(err.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn === undefined) return;
    if (!accessToken || user?.role !== 'admin') {
      setError('Admin access required');
      return;
    }
    fetchLogs(0);
  }, [isLoggedIn, accessToken, user]);

  const handleFilter = () => {
    setFilter({ projectId: filterInput.projectId.trim() || undefined, sessionId: filterInput.sessionId.trim() || undefined });
    fetchLogs(0);
  };

  const handleDelete = async (id: string) => {
    if (!accessToken) return;
    setDeleting(id);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/admin/conversation-logs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      fetchLogs(skip);
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  // Group logs by sessionId
  const sessions = useMemo<SessionGroup[]>(() => {
    if (!data?.logs) return [];
    const map = new Map<string, ConvLogRow[]>();
    for (const log of data.logs) {
      const list = map.get(log.sessionId) || [];
      list.push(log);
      map.set(log.sessionId, list);
    }
    return Array.from(map.entries()).map(([sessionId, turns]) => {
      const sorted = turns.sort((a, b) => a.turn - b.turn);
      const safetyJson = sorted.find(t => t.safetyJson && typeof t.safetyJson === 'object')?.safetyJson;
      let safetyLevel: string | null = null;
      if (safetyJson && typeof safetyJson === 'object' && !Array.isArray(safetyJson)) {
        safetyLevel = (safetyJson as any).riskLevel || null;
      }
      return {
        sessionId,
        turns: sorted,
        projectId: sorted.find(t => t.projectId)?.projectId || null,
        firstAt: sorted[0]?.createdAt || '',
        lastAt: sorted[sorted.length - 1]?.createdAt || '',
        safetyLevel,
      };
    }).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [data]);

  const safetyBadge = (level: string | null) => {
    if (!level || level === 'none') return null;
    const colors: Record<string, string> = {
      low: 'bg-slate-100 text-slate-600',
      medium: 'bg-amber-100 text-amber-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[level] || colors.medium}`}>
        {level}
      </span>
    );
  };

  if (isLoggedIn === undefined || !user) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (user.role !== 'admin') {
    return <div className="p-6 text-slate-300">Admin access required</div>;
  }

  const totalSessions = sessions.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">AI Conversation Logs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every wizard conversation turn stored for LLM training — grouped by session.
          {data && <> Showing {sessions.length} of {data.total} rows ({totalSessions} sessions).</>}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Project ID"
          value={filterInput.projectId}
          onChange={e => setFilterInput(p => ({ ...p, projectId: e.target.value }))}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs w-44"
        />
        <input
          type="text"
          placeholder="Session ID"
          value={filterInput.sessionId}
          onChange={e => setFilterInput(p => ({ ...p, sessionId: e.target.value }))}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs w-44"
        />
        <button
          onClick={handleFilter}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
        >
          Filter
        </button>
        {(filter.projectId || filter.sessionId) && (
          <button
            onClick={() => { setFilterInput({ projectId: '', sessionId: '' }); setFilter({}); fetchLogs(0); }}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading && <div className="py-8 text-center text-sm text-slate-500">Loading…</div>}

      {/* Session list */}
      {!loading && sessions.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No conversation logs found. Create a project through the AI wizard to generate data.
        </div>
      )}

      {!loading && sessions.map((session) => (
        <div key={session.sessionId} className="mb-3 rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Session header */}
          <button
            type="button"
            onClick={() => setExpandedSession(expandedSession === session.sessionId ? null : session.sessionId)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
          >
            <span className="text-xs text-slate-400">
              {expandedSession === session.sessionId ? '▼' : '▶'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-slate-600 truncate">{session.sessionId.slice(0, 12)}…</code>
                {session.projectId && (
                  <a
                    href={`/projects/${session.projectId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] text-sky-600 hover:underline"
                  >
                    Project ↗
                  </a>
                )}
                {!session.projectId && (
                  <span className="text-[10px] text-amber-600 font-medium">Orphaned</span>
                )}
                {safetyBadge(session.safetyLevel)}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                <span>{session.turns.length} turns</span>
                <span>{new Date(session.firstAt).toLocaleString()}</span>
                <span>→ {new Date(session.lastAt).toLocaleString()}</span>
              </div>
            </div>
          </button>

          {/* Expanded: turn-by-turn */}
          {expandedSession === session.sessionId && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
              {session.turns.map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-semibold text-slate-500">
                      Turn {log.turn} — {log.role}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        disabled={deleting === log.id}
                        onClick={() => handleDelete(log.id)}
                        className="text-[10px] text-red-500 hover:text-red-700 disabled:opacity-30"
                      >
                        {deleting === log.id ? '…' : '🗑'}
                      </button>
                    </div>
                  </div>
                  {log.prompt && (
                    <div className="mb-1">
                      <span className="text-[10px] font-medium text-slate-400">Prompt:</span>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{log.prompt.slice(0, 300)}{log.prompt.length > 300 ? '…' : ''}</p>
                    </div>
                  )}
                  {log.userResponse && (
                    <div className="mb-1">
                      <span className="text-[10px] font-medium text-slate-400">Response:</span>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.userResponse.slice(0, 300)}{log.userResponse.length > 300 ? '…' : ''}</p>
                    </div>
                  )}
                  {log.safetyJson && typeof log.safetyJson === 'object' && !Array.isArray(log.safetyJson) && (
                    <div className="mt-1 rounded bg-amber-50/60 px-2 py-1">
                      <span className="text-[10px] font-medium text-amber-600">
                        Safety: {(log.safetyJson as any).riskLevel || 'N/A'}
                      </span>
                      {Array.isArray((log.safetyJson as any).concerns) && (log.safetyJson as any).concerns.length > 0 && (
                        <div className="text-[10px] text-amber-700 mt-0.5">
                          {(log.safetyJson as any).concerns.slice(0, 3).map((c: string, i: number) => (
                            <span key={i} className="block">⚠ {c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Pagination */}
      {data && data.total > take && (
        <div className="flex items-center justify-between mt-4">
          <button
            disabled={skip === 0}
            onClick={() => fetchLogs(Math.max(0, skip - take))}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-500">
            {skip + 1}–{Math.min(skip + take, data.total)} of {data.total}
          </span>
          <button
            disabled={skip + take >= data.total}
            onClick={() => fetchLogs(skip + take)}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
