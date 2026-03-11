'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type SupportRequestStatus = 'unassigned' | 'claimed' | 'in_progress' | 'resolved';
type SupportRequestChannel = 'whatsapp' | 'callback';

interface Reply {
  body: string;
  sentAt: string;
  adminId?: string;
  direction: 'inbound' | 'outbound';
}

interface SupportRequest {
  id: string;
  channel: SupportRequestChannel;
  fromNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  body: string;
  status: SupportRequestStatus;
  assignedAdminId: string | null;
  assignedAdmin?: { id: string; firstName: string; surname: string } | null;
  claimedAt: string | null;
  resolvedAt: string | null;
  projectId: string | null;
  project?: { id: string; projectName: string } | null;
  notes: string | null;
  replies: Reply[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<SupportRequestStatus, string> = {
  unassigned: 'Unassigned',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

const STATUS_COLOURS: Record<SupportRequestStatus, string> = {
  unassigned: 'bg-amber-100 text-amber-800',
  claimed: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  resolved: 'bg-green-100 text-green-800',
};

const CHANNEL_LABELS: Record<SupportRequestChannel, string> = {
  whatsapp: '💬 WhatsApp',
  callback: '📞 Callback',
};

export default function AdminSupportPage() {
  const { accessToken, user } = useAuth();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SupportRequest | null>(null);
  const [replyText, setReplyText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<'pool' | 'mine' | 'resolved'>('pool');
  const [showResolved, setShowResolved] = useState(false);
  const [resolved, setResolved] = useState<SupportRequest[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }),
    [accessToken],
  );

  const loadPool = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/support-requests`, { headers: headers() });
      if (res.ok) {
        const data: SupportRequest[] = await res.json();
        setRequests(data);
        // refresh selected if open
        setSelected((prev) => (prev ? data.find((r) => r.id === prev.id) ?? prev : null));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const loadResolved = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/support-requests/resolved`, { headers: headers() });
      if (res.ok) setResolved(await res.json());
    } catch {
      // silent
    }
  }, [accessToken, headers]);

  useEffect(() => {
    loadPool();
    pollRef.current = setInterval(loadPool, 20_000); // poll every 20 s
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadPool]);

  useEffect(() => {
    if (showResolved) loadResolved();
  }, [showResolved, loadResolved]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const action = useCallback(
    async (url: string, method: 'PATCH' | 'POST', body?: object) => {
      const res = await fetch(`${API_BASE_URL}${url}`, {
        method,
        headers: headers(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    [headers],
  );

  const handleClaim = async (id: string) => {
    try {
      await action(`/support-requests/${id}/claim`, 'PATCH');
      await loadPool();
    } catch (err) {
      alert(`Could not claim: ${(err as Error).message}`);
    }
  };

  const handleRelease = async (id: string) => {
    try {
      await action(`/support-requests/${id}/release`, 'PATCH');
      await loadPool();
    } catch (err) {
      alert(`Could not release: ${(err as Error).message}`);
    }
  };

  const handleResolve = async (id: string) => {
    if (!confirm('Mark this request as resolved?')) return;
    try {
      await action(`/support-requests/${id}/resolve`, 'PATCH');
      await loadPool();
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      alert(`Could not resolve: ${(err as Error).message}`);
    }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await action(`/support-requests/${selected.id}/reply`, 'POST', { message: replyText });
      setReplyText('');
      await loadPool();
    } catch (err) {
      alert(`Could not send reply: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    try {
      await action(`/support-requests/${selected.id}/notes`, 'PATCH', { notes: notesText });
      await loadPool();
    } catch (err) {
      alert(`Could not save notes: ${(err as Error).message}`);
    }
  };

  // ── Derived lists ─────────────────────────────────────────────────────────

  const pool = requests.filter((r) => r.status === 'unassigned');
  const mine = requests.filter((r) => r.assignedAdminId === user?.id && r.status !== 'resolved');
  const activeList = tab === 'pool' ? pool : tab === 'mine' ? mine : resolved;

  // ── UI ────────────────────────────────────────────────────────────────────

  const openRequest = (req: SupportRequest) => {
    setSelected(req);
    setNotesText(req.notes ?? '');
    setReplyText('');
  };

  return (
    <div className="flex h-full gap-6">
      {/* ── Left panel: list ── */}
      <div className="w-full max-w-md flex-none flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Support Requests</h1>
          <button
            onClick={loadPool}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm font-medium">
          {(['pool', 'mine', 'resolved'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === 'resolved') setShowResolved(true);
              }}
              className={`flex-1 rounded-md py-1.5 capitalize transition-colors ${
                tab === t
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'pool' ? `Pool (${pool.length})` : t === 'mine' ? `Mine (${mine.length})` : 'Resolved'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : activeList.length === 0 ? (
          <p className="text-sm text-slate-500">
            {tab === 'pool' ? 'No unassigned requests 🎉' : tab === 'mine' ? 'Nothing claimed by you.' : 'No resolved requests yet.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto">
            {activeList.map((req) => (
              <li key={req.id}>
                <button
                  onClick={() => openRequest(req)}
                  className={`w-full rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                    selected?.id === req.id
                      ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {req.clientName ?? req.fromNumber ?? 'Unknown'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{req.body}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                      <span className="text-xs text-slate-400">{CHANNEL_LABELS[req.channel]}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(req.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Right panel: detail ── */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p className="text-sm">Select a request to view details</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {selected.clientName ?? selected.fromNumber ?? 'Unknown Contact'}
                </h2>
                {selected.clientEmail && (
                  <p className="text-sm text-slate-500">{selected.clientEmail}</p>
                )}
                {selected.fromNumber && (
                  <p className="text-sm text-slate-500">{selected.fromNumber}</p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                  <span className="text-xs text-slate-400">{CHANNEL_LABELS[selected.channel]}</span>
                  {selected.assignedAdmin && (
                    <span className="text-xs text-slate-500">
                      → {selected.assignedAdmin.firstName} {selected.assignedAdmin.surname}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                {selected.status === 'unassigned' && (
                  <button
                    onClick={() => handleClaim(selected.id)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Claim
                  </button>
                )}
                {(selected.status === 'claimed' || selected.status === 'in_progress') &&
                  selected.assignedAdminId === user?.id && (
                    <button
                      onClick={() => handleRelease(selected.id)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Release
                    </button>
                  )}
                {selected.status !== 'resolved' && (
                  <button
                    onClick={() => handleResolve(selected.id)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>

            {/* Original message */}
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Initial message</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {new Date(selected.createdAt).toLocaleString('en-GB')}
              </p>
            </div>

            {/* Thread / replies */}
            {selected.replies && selected.replies.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Thread</p>
                {selected.replies.map((reply, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-4 py-3 text-sm ${
                      reply.direction === 'inbound'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-indigo-50 text-indigo-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{reply.body}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {reply.direction === 'inbound' ? 'Client' : 'Admin'} ·{' '}
                      {new Date(reply.sentAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Reply composer (whatsapp only, or always for callback notes) */}
            {selected.status !== 'resolved' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {selected.channel === 'whatsapp' ? 'Reply via WhatsApp' : 'Log a note / contact'}
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  placeholder={
                    selected.channel === 'whatsapp'
                      ? 'Type a WhatsApp reply…'
                      : 'Log contact notes…'
                  }
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="self-end rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : selected.channel === 'whatsapp' ? 'Send' : 'Log'}
                </button>
              </div>
            )}

            {/* Internal notes */}
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Internal notes
              </label>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={2}
                placeholder="Notes visible only to admins…"
                className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <button
                onClick={handleSaveNotes}
                className="self-end rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Save notes
              </button>
            </div>

            {/* Project link info */}
            {selected.project && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Linked project
                </p>
                <p className="mt-1 text-sm text-slate-700">{selected.project.projectName}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
