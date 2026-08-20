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
  structuredJson: any;
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

const asRecord = (v: any): Record<string, any> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;

const questionOf = (log: ConvLogRow): string | null => {
  const nq = asRecord(log.structuredJson)?.nextQuestions;
  return Array.isArray(nq) && nq.length > 0 && typeof nq[0] === 'string' ? nq[0] : null;
};

const optionsOf = (log: ConvLogRow): any[] => {
  const opts = asRecord(log.structuredJson)?.options;
  return Array.isArray(opts) ? opts : [];
};

const sourceOf = (log: ConvLogRow): string | null => {
  const m = asRecord(log.metadata)?.questionSource;
  if (typeof m === 'string') return m;
  const s = asRecord(log.structuredJson)?.questionSource;
  return typeof s === 'string' ? s : null;
};

function SourceBadge({ source }: { source: string }) {
  const tone: Record<string, string> = {
    ai: 'bg-sky-100 text-sky-700',
    bank: 'bg-emerald-100 text-emerald-700',
    seed: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${tone[source] || 'bg-slate-100 text-slate-600'}`}>
      {source}
    </span>
  );
}

function DetailPanel({
  log,
  deleting,
  onDelete,
}: {
  log: ConvLogRow;
  deleting: string | null;
  onDelete: (id: string) => void;
}) {
  const sj = asRecord(log.structuredJson);
  const safety = asRecord(log.safetyJson);
  const source = sourceOf(log);
  const confidence = typeof sj?.overallConfidence === 'number' ? sj.overallConfidence : null;
  const trades: string[] = Array.isArray(sj?.trades) ? sj.trades.filter((t) => typeof t === 'string') : [];
  const coveredTopics: string[] = Array.isArray(sj?.coveredTopics)
    ? sj.coveredTopics.filter((t) => typeof t === 'string')
    : [];
  const title = typeof sj?.title === 'string' ? sj.title : null;
  const summary = typeof sj?.summary === 'string' ? sj.summary : null;
  const riskLevel = typeof safety?.riskLevel === 'string' ? safety.riskLevel : null;
  const concerns: string[] = Array.isArray(safety?.concerns)
    ? safety.concerns.filter((c) => typeof c === 'string')
    : [];

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {log.role === 'assistant' ? 'Mimo AI' : 'Client'} · Turn {log.turn}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
        </div>
        <button
          type="button"
          disabled={deleting === log.id}
          onClick={() => onDelete(log.id)}
          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-30"
        >
          {deleting === log.id ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {source && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Question source</span>
          <SourceBadge source={source} />
        </div>
      )}

      {confidence !== null && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-medium text-slate-400">Overall confidence</p>
          <p className="text-sm font-semibold text-slate-900">{Math.round(confidence * 100)}%</p>
        </div>
      )}

      {title && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-medium text-slate-400">Project title</p>
          <p className="text-xs font-semibold text-slate-800">{title}</p>
        </div>
      )}

      {summary && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-medium text-slate-400">Summary</p>
          <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {trades.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-medium text-slate-400">Trades</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {trades.map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{t}</span>
            ))}
          </div>
        </div>
      )}

      {coveredTopics.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-medium text-slate-400">Covered topics</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {coveredTopics.map((t) => (
              <span key={t} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t}</span>
            ))}
          </div>
        </div>
      )}

      {(riskLevel || concerns.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-medium text-amber-600">Safety {riskLevel ? `— ${riskLevel}` : ''}</p>
          {concerns.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {concerns.slice(0, 8).map((c, i) => (
                <p key={i} className="text-[10px] text-amber-700">⚠ {c}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-400 break-all">
        <p className="font-medium text-slate-500">Row</p>
        <p>id: {log.id}</p>
        {log.projectId && <p>projectId: {log.projectId}</p>}
        {log.aiIntakeId && <p>aiIntakeId: {log.aiIntakeId}</p>}
      </div>

      <details className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Structured JSON
        </summary>
        <pre className="max-h-[45vh] overflow-auto border-t border-slate-100 bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-200 whitespace-pre-wrap">
          {log.structuredJson ? JSON.stringify(log.structuredJson, null, 2) : '—'}
        </pre>
      </details>
    </div>
  );
}

export default function ConversationLogsPage() {
  const { accessToken, user, isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConvLogListResponse | null>(null);
  const [filter, setFilter] = useState<{ projectId?: string; sessionId?: string }>({});
  const [filterInput, setFilterInput] = useState({ projectId: '', sessionId: '' });
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
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

  const selectedLog = useMemo(() => {
    if (!selectedLogId) return null;
    for (const s of sessions) {
      const hit = s.turns.find((t) => t.id === selectedLogId);
      if (hit) return hit;
    }
    return null;
  }, [selectedLogId, sessions]);

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
            onClick={() => {
              setExpandedSession(expandedSession === session.sessionId ? null : session.sessionId);
              setSelectedLogId(null);
            }}
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

          {/* Expanded: chat-style conversation + detail panel */}
          {expandedSession === session.sessionId && (
            <div className="border-t border-slate-100">
              <div className="grid grid-cols-1 lg:h-[70vh] lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
                {/* Chat window */}
                <div className="min-h-0 overflow-y-auto bg-slate-50/40 px-4 py-4">
                  <div className="space-y-3">
                    {session.turns.map((log) => {
                      const isAssistant = log.role === 'assistant';
                      const question = questionOf(log);
                      const options = optionsOf(log);
                      const source = sourceOf(log);
                      const selected = selectedLogId === log.id;
                      return (
                        <div key={log.id} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedLogId(log.id)}
                            className={`max-w-[88%] rounded-2xl px-4 py-3 text-left shadow-sm transition ${selected ? 'ring-2 ring-sky-400' : ''} ${
                              isAssistant
                                ? 'border border-slate-200 bg-white'
                                : 'bg-sky-600 text-white'
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span className={`text-[10px] font-semibold ${isAssistant ? 'text-slate-400' : 'text-sky-100'}`}>
                                {isAssistant ? 'Mimo AI' : 'Client'} · Turn {log.turn}
                              </span>
                              {isAssistant && source ? <SourceBadge source={source} /> : null}
                            </div>

                            {isAssistant ? (
                              <>
                                {log.userResponse && (
                                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-800">{log.userResponse}</p>
                                )}
                                {question && (
                                  <div className="mt-2 rounded-xl border border-[#D4C8A0] bg-[#F5EEDE] px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Asked</p>
                                    <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-900">{question}</p>
                                    {options.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {options.map((o: any, i: number) => (
                                          <span key={i} className="rounded-full border border-[#D4C8A0] bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                            {typeof o === 'string' ? o : (o?.label ?? o?.value ?? '')}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-xs leading-relaxed whitespace-pre-wrap">{log.prompt}</p>
                            )}

                            <div className={`mt-1.5 text-[10px] ${isAssistant ? 'text-slate-400' : 'text-sky-200'}`}>
                              {new Date(log.createdAt).toLocaleString()}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detail panel */}
                <div className="min-h-0 overflow-y-auto border-t border-slate-100 bg-slate-50/80 lg:border-l lg:border-t-0">
                  {selectedLog ? (
                    <DetailPanel log={selectedLog} deleting={deleting} onDelete={handleDelete} />
                  ) : (
                    <div className="p-6 text-xs text-slate-400">
                      Select a message to see its full details (structured JSON, safety, confidence).
                    </div>
                  )}
                </div>
              </div>
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
