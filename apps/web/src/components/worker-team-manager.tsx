'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

type Invite = { id: string; email: string; status: string; expiresAt: string; createdAt: string };
type WorkerRow = {
  id: string;
  email: string;
  fullName: string | null;
  businessName: string | null;
};

const statusTone: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-slate-100 text-slate-500',
};

export function WorkerTeamManager({ accessToken }: { accessToken: string }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [invRes, wkRes] = await Promise.all([
        fetch(`${API_BASE_URL}/professional/worker-invites`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE_URL}/professional/workers`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      const inv = invRes.ok ? await invRes.json() : [];
      const wk = wkRes.ok ? await wkRes.json() : [];
      setInvites(Array.isArray(inv) ? inv : []);
      setWorkers(Array.isArray(wk) ? wk : []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async () => {
    if (!email.trim()) {
      setError('Enter an email address');
      return;
    }
    setBusy(true);
    setError(null);
    setLastInviteUrl(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/worker-invites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Invite failed');
      }
      const data = await res.json();
      setLastInviteUrl(data.inviteUrl || null);
      setEmail('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetch(`${API_BASE_URL}/professional/worker-invites/${id}/revoke`, {
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
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {/* Workers */}
      {workers.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workers</p>
          <ul className="mt-1.5 space-y-1.5">
            {workers.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm">
                <span className="text-slate-800">
                  {w.fullName || w.businessName || w.email || 'Worker'}
                  <span className="ml-1 text-xs text-slate-400">· {w.email}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite form */}
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="worker@example.com"
          className="min-w-0 flex-1 rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm text-slate-800 outline-none focus:border-[rgba(185,78,45,0.5)]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={invite}
          className="shrink-0 rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50"
        >
          {busy ? '…' : 'Invite worker'}
        </button>
      </div>

      {lastInviteUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
          <p className="font-semibold text-emerald-800">Invite link created</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-700">{lastInviteUrl}</code>
            <button type="button" onClick={copyLink} className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Invites */}
      {invites.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invites</p>
          <ul className="mt-1.5 space-y-1.5">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm">
                <span className="text-slate-800">
                  {inv.email}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusTone[inv.status] || 'bg-slate-100 text-slate-500'}`}>
                    {inv.status}
                  </span>
                </span>
                {inv.status === 'pending' && (
                  <button type="button" disabled={busy} onClick={() => revoke(inv.id)} className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
