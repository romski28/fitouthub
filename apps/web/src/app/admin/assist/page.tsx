"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import Link from "next/link";

type AssistRequest = {
  id: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; projectName: string; status: string; region: string; clientName: string };
  user?: { id: string; firstName?: string; surname?: string; email?: string } | null;
};

type AssistMessage = {
  id: string;
  assistRequestId: string;
  senderType: "client" | "foh";
  senderUserId?: string | null;
  content: string;
  createdAt: string;
  readByFohAt?: string | null;
  readByClientAt?: string | null;
};

export default function AdminAssistPage() {
  const [statusTab, setStatusTab] = useState<"open" | "in_progress" | "closed">("open");
  const [requests, setRequests] = useState<AssistRequest[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState<string>("");
  const [msgSubmitting, setMsgSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/assist-requests?status=${statusTab}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRequests(data.items || []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [statusTab]);

  const openThread = async (id: string) => {
    setActiveId(id);
    setMsgText("");
    setMessages([]);
    setMsgLoading(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/assist-requests/${encodeURIComponent(id)}/messages?limit=200`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setMsgLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!activeId || !msgText.trim()) return;
    setMsgSubmitting(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/assist-requests/${encodeURIComponent(activeId)}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "foh", content: msgText.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsgText("");
      await openThread(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMsgSubmitting(false);
    }
  };

  const tabs = useMemo(() => ([
    { key: "open" as const, label: "Open" },
    { key: "in_progress" as const, label: "In Progress" },
    { key: "closed" as const, label: "Closed" },
  ]), []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
          <h1 className="text-2xl font-bold">Assist Requests</h1>
          <p className="text-sm text-slate-200/90">FOH help requests for project scoping and organisation.</p>
        </div>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold border ${statusTab === t.key ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto text-sm text-slate-600">{total} {statusTab.replace('_',' ')} requests</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No requests.</div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className={`rounded-lg border ${activeId === req.id ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'} bg-white p-4 shadow-sm`}> 
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{req.project.projectName}</div>
                    <div className="text-xs text-slate-600">{req.project.region} • Client: {req.project.clientName}</div>
                    {req.notes ? (
                      <p className="mt-1 text-xs text-slate-700 line-clamp-2">{req.notes}</p>
                    ) : null}
                    <div className="mt-1 text-xs text-slate-500">Created {new Date(req.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">{req.status.replace('_',' ')}</span>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => openThread(req.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View messages</button>
                      <Link href={`/projects/${req.project.id}`} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Open project</Link>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Messages</h2>
              {activeId ? (
                <span className="text-xs text-slate-600">Thread: {activeId.slice(0,8)}…</span>
              ) : null}
            </div>
            {!activeId ? (
              <p className="mt-2 text-sm text-slate-600">Select a request to view messages.</p>
            ) : msgLoading ? (
              <p className="mt-2 text-sm text-slate-600">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No messages yet.</p>
            ) : (
              <div className="mt-2 space-y-2 max-h-[360px] overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id} className={`rounded-md border px-3 py-2 text-sm ${m.senderType === 'foh' ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide">{m.senderType === 'foh' ? 'FOH' : 'Client'}</span>
                      <span className="text-[11px] text-slate-500">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 grid gap-2">
              <textarea
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                rows={3}
                placeholder="Type a message to the client…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                disabled={!activeId}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!activeId || msgSubmitting || !msgText.trim()}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {msgSubmitting ? 'Sending…' : 'Send message'}
                </button>
              </div>
              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
