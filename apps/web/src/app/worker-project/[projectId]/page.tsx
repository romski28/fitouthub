'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { InspectSiteModal } from '@/components/next-steps/inspect-site-modal';

type WorkerProject = {
  project: {
    id: string;
    projectName: string;
    clientName: string;
    region: string;
    notes?: string | null;
    endDate?: string | null;
    property?: {
      displayAddress?: string | null;
      buildingName?: string | null;
      buildingNameZh?: string | null;
      unitNumber?: string | null;
      floorLevel?: string | null;
      blockTower?: string | null;
      street?: string | null;
    } | null;
    photos?: { id: string; url?: string; storageKey?: string; note?: string | null }[];
  };
  employer?: {
    id: string;
    businessName?: string | null;
    fullName?: string | null;
    phone?: string | null;
    serviceArea?: string | null;
    locationPrimary?: string | null;
    locationSecondary?: string | null;
    locationTertiary?: string | null;
  } | null;
  access?: { id: string; expiresAt?: string | null; isOngoing?: boolean; accessType?: 'ongoing' | 'magic' };
};

type Action = 'check_in' | 'start' | 'update' | 'complete';

const ACTION_LABELS: { key: Action; label: string; hint: string }[] = [
  { key: 'check_in', label: 'Checked in on site', hint: 'Record arrival and visit notes.' },
  { key: 'start', label: 'Started work', hint: 'Mark the project as started on site.' },
  { key: 'update', label: 'Post progress update', hint: 'Share a progress update with the project.' },
  { key: 'complete', label: 'Mark complete', hint: 'Record completion of your work.' },
];

export default function WorkerProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId || '';
  const router = useRouter();
  const { accessToken, isLoggedIn, professional } = useProfessionalAuth();

  const [data, setData] = useState<WorkerProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<{ id: string; senderType: string; content: string; createdAt: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/worker-project/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) {
        router.replace('/');
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || 'Failed to load project');
      }
      setData(body);
    } catch (e: any) {
      setError(e.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId, accessToken, router]);

  useEffect(() => {
    if (isLoggedIn === false) {
      router.replace('/');
      return;
    }
    load();
  }, [isLoggedIn, load, router]);

  const submitAction = async (action: Action) => {
    if (!accessToken || !projectId) return;
    setBusyAction(action);
    setError(null);
    setToastMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/worker-project/${projectId}/${action === 'check_in' ? 'check-in' : action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || 'Action failed');
      }
      setNote('');
      setToastMsg(ACTION_LABELS.find((a) => a.key === action)?.label + ' recorded.');
      setTimeout(() => setToastMsg(null), 3000);
    } catch (e: any) {
      setError(e.message || 'Action failed');
    } finally {
      setBusyAction(null);
    }
  };

  const isOngoing = data?.access?.accessType === 'ongoing';

  const loadChat = useCallback(async () => {
    if (!projectId || !accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load chat');
      const body = await res.json().catch(() => ({}));
      setChatMessages(Array.isArray(body?.messages) ? body.messages : []);
    } catch (e: any) {
      setChatError(e.message || 'Failed to load chat');
    }
  }, [projectId, accessToken]);

  useEffect(() => {
    if (isOngoing) loadChat();
  }, [isOngoing, loadChat]);

  const sendChat = async () => {
    const content = chatInput.trim();
    if (!content || sendingChat) return;
    setSendingChat(true);
    setChatError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || 'Failed to send');
      }
      setChatInput('');
      const b = await res.json().catch(() => ({}));
      if (b?.message) setChatMessages((prev) => [...prev, b.message]);
    } catch (e: any) {
      setChatError(e.message || 'Failed to send');
    } finally {
      setSendingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F5EEDE] px-4 text-center">
        <h1 className="text-lg font-bold text-slate-900">Access denied</h1>
        <p className="max-w-sm text-sm text-slate-600">{error}</p>
        <Link href="/" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Go to home
        </Link>
      </div>
    );
  }

  const project = data?.project;

  return (
    <div className="min-h-screen bg-[#F5EEDE] pb-16">
      <header className="border-b border-[#D4C8A0] bg-white/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <button onClick={() => router.back()} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Back
          </button>
          <span className="rounded-full bg-[#FF7F50]/10 px-3 py-1 text-xs font-semibold text-[#b94e2d]">
            👷 Worker access
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-[#D4C8A0] bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{project?.projectName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {project?.clientName} · {project?.region}
          </p>

          {data?.access && (
            <p className="mt-2 text-xs text-slate-400">
              {data.access.isOngoing ? 'Access: ongoing' : `Access expires ${data.access.expiresAt ? new Date(data.access.expiresAt).toLocaleString('en-HK') : ''}`}
            </p>
          )}

          {project?.property && (
            <div className="mt-4 rounded-xl border border-[#D4C8A0] bg-[#FDFBF3] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b94e2d]">Site address</p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {project.property.displayAddress ||
                  [project.property.blockTower, project.property.floorLevel, project.property.unitNumber, project.property.buildingName]
                    .filter(Boolean)
                    .join(' ') ||
                  'Address to be confirmed'}
              </p>
            </div>
          )}

          {project?.notes && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{project.notes}</p>
            </div>
          )}

          {data?.employer && (
            <div className="mt-4 rounded-xl border border-[#D4C8A0] bg-[#FDFBF3] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b94e2d]">Employer</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {data.employer.businessName || data.employer.fullName || 'Your employer'}
              </p>
              {data.employer.phone && <p className="text-sm text-slate-600">{data.employer.phone}</p>}
              <p className="text-sm text-slate-600">
                {[data.employer.serviceArea, data.employer.locationPrimary, data.employer.locationSecondary, data.employer.locationTertiary]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          )}

          {project?.photos && project.photos.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {project.photos.slice(0, 6).map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.url || photo.storageKey || ''}
                    alt={photo.note || 'project photo'}
                    className="h-24 w-full rounded-lg border border-[#D4C8A0] object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {isOngoing && (
          <div className="rounded-2xl border border-[#D4C8A0] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Project chat</h2>
            <p className="mt-1 text-xs text-slate-500">Message the client directly about this project.</p>

            {chatError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{chatError}</div>}

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[#D4C8A0] bg-[#FDFBF3] p-3">
              {chatMessages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
              {chatMessages.map((m) => (
                <div key={m.id} className={`flex ${m.senderType === 'professional' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.senderType === 'professional' ? 'bg-emerald-600 text-[#F5EEDE]' : 'bg-white text-slate-800 border border-[#D4C8A0]'}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p className={`mt-1 text-[10px] ${m.senderType === 'professional' ? 'text-[#F5EEDE]/70' : 'text-slate-400'}`}>
                      {new Date(m.createdAt).toLocaleString('en-HK')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                placeholder="Type a message…"
                className="flex-1 rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={sendingChat || !chatInput.trim()}
                className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-[#F5EEDE] hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {sendingChat ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#D4C8A0] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Site inspection</h2>
          <p className="mt-1 text-xs text-slate-500">
            Check in on site with the QR code or 6-digit code, record visit notes, and mark the visit complete.
          </p>
          <button
            type="button"
            onClick={() => setInspectionOpen(true)}
            className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-[#F5EEDE] hover:bg-emerald-700 transition"
          >
            Open site inspection
          </button>
        </div>

        <div className="rounded-2xl border border-[#D4C8A0] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">On-site actions</h2>
          <p className="mt-1 text-xs text-slate-500">
            These actions are posted to the project thread and visible to your employer and the client.
          </p>

          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {toastMsg && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{toastMsg}</div>}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note…"
            rows={2}
            className="mt-4 w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            {ACTION_LABELS.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={busyAction !== null}
                onClick={() => submitAction(a.key)}
                title={a.hint}
                className="rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-[#F5EEDE] hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyAction === a.key ? 'Posting…' : a.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      <InspectSiteModal
        isOpen={inspectionOpen}
        onClose={() => setInspectionOpen(false)}
        projectId={projectId}
        workerMode
      />
    </div>
  );
}
