'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL } from '@/config/api';

type DelegateProject = {
  project: {
    id: string;
    projectName: string;
    clientName: string;
    region: string;
    notes?: string | null;
    endDate?: string | null;
    status?: string | null;
    currentStage?: string | null;
    property?: {
      displayAddress?: string | null;
      buildingName?: string | null;
      unitNumber?: string | null;
      floorLevel?: string | null;
      blockTower?: string | null;
      street?: string | null;
    } | null;
  };
  access?: { id: string; accessType?: 'ongoing' | 'magic'; task?: string | null; isOngoing?: boolean; permissions?: Record<string, boolean> | null };
  siteInspection?: { active: boolean; phase?: 'booking' | 'check_in' | null };
};

const STAGE_LABELS: Record<string, string> = {
  CREATED: 'Project created',
  BIDDING_ACTIVE: 'Bidding',
  SITE_VISIT_SCHEDULED: 'Site visit scheduled',
  SITE_VISIT_COMPLETE: 'Site visit complete',
  QUOTE_RECEIVED: 'Quote received',
  BIDDING_CLOSED: 'Bidding closed',
  CONTRACT_PHASE: 'Contract phase',
  PRE_WORK: 'Pre-work',
  WORK_IN_PROGRESS: 'Work in progress',
  MILESTONE_PENDING: 'Milestone pending',
  PAYMENT_RELEASED: 'Payment released',
  NEAR_COMPLETION: 'Near completion',
  FINAL_INSPECTION: 'Final inspection',
  COMPLETE: 'Complete',
  WARRANTY_PERIOD: 'Warranty',
  CLOSED: 'Closed',
  PAUSED: 'Paused',
  DISPUTED: 'Disputed',
};

export default function DelegateProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId || '';
  const router = useRouter();
  const { accessToken } = useAuth();

  const [data, setData] = useState<DelegateProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'check_in' | 'update' | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/client/delegate-project/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.message) || `HTTP ${res.status}`);
      }
      setData((await res.json()) as DelegateProject);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAction = async (action: 'check_in' | 'update') => {
    if (action === 'update' && !note.trim()) {
      setToastMsg('Add a short note first.');
      return;
    }
    setBusy(action);
    setToastMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/client/delegate-project/${projectId}/action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.message) || `HTTP ${res.status}`);
      }
      setNote('');
      setToastMsg(action === 'check_in' ? 'Checked in on site.' : 'Progress reported to the client.');
      setTimeout(() => setToastMsg(null), 2500);
    } catch (e: any) {
      setToastMsg(e.message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const confirmOnSite = async () => {
    if (!code.trim()) {
      setConfirmMsg('Enter the 6-digit code shown by the professional.');
      return;
    }
    const isCheckIn = data?.siteInspection?.active && data.siteInspection.phase === 'check_in';
    const endpoint = isCheckIn
      ? `/projects/${projectId}/site-inspection/confirm`
      : `/projects/${projectId}/site-start/confirm`;
    setConfirming(true);
    setConfirmMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.message) || `HTTP ${res.status}`);
      }
      setCode('');
      setConfirmMsg(isCheckIn ? 'Site inspection confirmed.' : 'Contractor confirmed on site.');
      setTimeout(() => setConfirmMsg(null), 2500);
    } catch (e: any) {
      setConfirmMsg(e.message || 'Something went wrong');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-white p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Project unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'No project found'}</p>
          <button onClick={() => router.replace('/project-delegate')} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Back to my projects
          </button>
        </div>
      </div>
    );
  }

  const { project, access, siteInspection } = data;
  const stage = project.currentStage ? STAGE_LABELS[String(project.currentStage).toUpperCase()] || String(project.currentStage).replace(/_/g, ' ') : null;

  return (
    <div className="min-h-screen bg-[#F5EEDE]">
      <header className="border-b border-[#D4C8A0] bg-white/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤝</span>
            <h1 className="text-xl font-bold text-slate-900">{project.projectName}</h1>
          </div>
          <Link href="/project-delegate" className="rounded-lg border border-[#D4C8A0] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white transition">
            My projects
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-8 shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</dt>
              <dd className="mt-1 text-sm text-slate-900">{project.clientName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Region</dt>
              <dd className="mt-1 text-sm text-slate-900">{project.region}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stage</dt>
              <dd className="mt-1 text-sm text-slate-900">{stage || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</dt>
              <dd className="mt-1 text-sm text-slate-900">{access?.isOngoing ? 'Ongoing' : access?.task === 'site_inspection' ? 'Site inspection (48h)' : 'Scoped'}</dd>
            </div>
            {project.property && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {[project.property.blockTower, project.property.street, project.property.buildingName, project.property.unitNumber].filter(Boolean).join(', ') || project.property.displayAddress || '—'}
                </dd>
              </div>
            )}
            {project.notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</dt>
                <dd className="mt-1 text-sm text-slate-700">{project.notes}</dd>
              </div>
            )}
          </dl>

          {siteInspection && (
            <div className="mt-6 rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.74)] p-5">
              <p className="text-sm font-semibold text-slate-800">Site inspection</p>
              <p className="mt-1 text-sm text-slate-600">
                {siteInspection.active
                  ? siteInspection.phase === 'check_in'
                    ? 'A visit is approved — ready to check in on site.'
                    : 'A visit slot can be booked.'
                  : 'Site inspection is not currently active.'}
              </p>
            </div>
          )}

          <div className="mt-8 rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.74)] p-5">
            <p className="text-sm font-semibold text-slate-800">Report progress</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Share a progress update or note for the client…"
              rows={3}
              className="mt-2 w-full rounded-xl border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => submitAction('update')}
                className="rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50"
              >
                {busy === 'update' ? 'Posting…' : 'Report progress'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => submitAction('check_in')}
                className="rounded-lg border border-[rgba(120,53,15,0.18)] bg-[rgba(255,250,240,0.9)] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[rgba(255,250,240,1)] disabled:opacity-50"
              >
                {busy === 'check_in' ? 'Checking in…' : 'Check in on site'}
              </button>
            </div>
            {toastMsg && <p className="mt-2 text-xs font-semibold text-slate-600">{toastMsg}</p>}
          </div>

          <div className="mt-4 rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.74)] p-5">
            <p className="text-sm font-semibold text-slate-800">Confirm on site</p>
            <p className="mt-1 text-xs text-slate-500">
              Enter the 6-digit code shown by the professional to confirm they are on site.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="mt-2 w-full rounded-xl border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-center text-lg tracking-[0.3em] text-slate-800 outline-none focus:border-[#b94e2d]"
            />
            <button
              type="button"
              disabled={confirming}
              onClick={confirmOnSite}
              className="mt-3 w-full rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50"
            >
              {confirming ? 'Confirming…' : 'Confirm on site'}
            </button>
            {confirmMsg && <p className="mt-2 text-xs font-semibold text-slate-600">{confirmMsg}</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
