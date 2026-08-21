'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

type WorkerRow = {
  id: string;
  email: string;
  fullName: string | null;
  businessName: string | null;
};
type Grant = {
  id: string;
  workerId: string | null;
  email: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export function ProjectAccessModal({
  accessToken,
  projectId,
  isOpen,
  onClose,
}: {
  accessToken: string;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'worker' | 'email'>('worker');
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wkRes, gRes] = await Promise.all([
        fetch(`${API_BASE_URL}/professional/workers`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API_BASE_URL}/projects/${projectId}/worker-access`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      const wk = wkRes.ok ? await wkRes.json() : [];
      const g = gRes.ok ? await gRes.json() : [];
      setWorkers(Array.isArray(wk) ? wk : []);
      setGrants(Array.isArray(g) ? g : []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const grantWorker = async () => {
    if (!selectedWorkerId) {
      setError('Select a worker');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/worker-access`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: selectedWorkerId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Grant failed');
      }
      setSelectedWorkerId('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const grantEmail = async () => {
    if (!email.trim()) {
      setError('Enter an email address');
      return;
    }
    setBusy(true);
    setError(null);
    setMagicUrl(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/worker-access`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Failed to create link');
      }
      const data = await res.json();
      setMagicUrl(data.magicUrl || null);
      setEmail('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetch(`${API_BASE_URL}/projects/${projectId}/worker-access/${grantId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!magicUrl) return;
    try {
      await navigator.clipboard.writeText(magicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl max-h-[90vh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Project worker access</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          <div className="flex gap-2 border-b border-[#D4C8A0]">
            <button
              type="button"
              onClick={() => setTab('worker')}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === 'worker' ? 'border-[#b94e2d] text-[#b94e2d]' : 'border-transparent text-slate-500'}`}
            >
              Registered worker
            </button>
            <button
              type="button"
              onClick={() => setTab('email')}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === 'email' ? 'border-[#b94e2d] text-[#b94e2d]' : 'border-transparent text-slate-500'}`}
            >
              Email magic link
            </button>
          </div>

          {tab === 'worker' ? (
            <div className="space-y-2">
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="">Select a worker…</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.fullName || w.businessName || w.email || 'Worker'}
                  </option>
                ))}
              </select>
              {workers.length === 0 && <p className="text-xs text-slate-500">No workers yet — invite them from your profile first.</p>}
              <button type="button" disabled={busy} onClick={grantWorker} className="w-full rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50">
                Grant access
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="worker@example.com"
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800"
              />
              <button type="button" disabled={busy} onClick={grantEmail} className="w-full rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50">
                Create 48h magic link
              </button>
              {magicUrl && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                  <p className="font-semibold text-emerald-800">48h link created</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-700">{magicUrl}</code>
                    <button type="button" onClick={copyLink} className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active access</p>
            {grants.length === 0 && <p className="mt-1 text-xs text-slate-400">No active grants.</p>}
            <ul className="mt-1.5 space-y-1.5">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm">
                  <span className="text-slate-800">
                    {g.email || 'Worker'}
                    <span className="ml-2 text-xs text-slate-400">{g.expiresAt ? `expires ${new Date(g.expiresAt).toLocaleDateString('en-HK')}` : 'ongoing'}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => revoke(g.id)} className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
