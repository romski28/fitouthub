'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '@/config/api';
import { tradesmen as fallbackTradesmen } from '@/data/tradesmen';

type WorkerRow = {
  id: string;
  email: string;
  fullName: string | null;
  businessName: string | null;
  phone: string | null;
  tradesOffered: string[];
  notes: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  status: string;
  name: string | null;
  phone: string | null;
  trades: string[];
  notes: string | null;
  expiresAt: string;
};

type ContactRow = {
  id: string;
  name: string;
  trades: string[];
  phone: string | null;
  email: string | null;
  notes: string | null;
  inviteStatus: string;
  linkedProfessionalId: string | null;
};

const statusTone: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  external: 'bg-slate-100 text-slate-500',
  invited: 'bg-amber-100 text-amber-700',
  joined: 'bg-emerald-100 text-emerald-700',
};

export function PeopleManager({ accessToken }: { accessToken: string }) {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [kind, setKind] = useState<'worker' | 'contractor'>('worker');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    trades: [] as string[],
    notes: '',
    invite: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wkRes, invRes, ctRes] = await Promise.all([
        fetch(`${API_BASE_URL}/professional/workers`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API_BASE_URL}/professional/worker-invites`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API_BASE_URL}/professional/contacts`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      const wk = wkRes.ok ? await wkRes.json() : [];
      const inv = invRes.ok ? await invRes.json() : [];
      const ct = ctRes.ok ? await ctRes.json() : [];
      setWorkers(Array.isArray(wk) ? wk : []);
      setInvites(Array.isArray(inv) ? inv : []);
      setContacts(Array.isArray(ct) ? ct : []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      let names: string[] = [];
      try {
        const res = await fetch(`${API_BASE_URL}/trades`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          names = Array.isArray(data)
            ? data.map((t: any) => (typeof t === 'string' ? t : t.title || t.name || t.label)).filter(Boolean).sort()
            : [];
        }
      } catch {
        /* fall through */
      }
      if (names.length === 0) names = fallbackTradesmen.map((t) => t.title).filter(Boolean).sort();
      setTradeOptions(names);
    })();
  }, []);

  const openModal = (k: 'worker' | 'contractor') => {
    setKind(k);
    setForm({ name: '', email: '', phone: '', trades: [], notes: '', invite: k === 'worker' });
    setError(null);
    setLink(null);
    setShowModal(true);
  };

  const addWorker = async () => {
    if (!form.email.trim()) {
      setError('Email is required');
      return;
    }
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/worker-invites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          name: form.name || undefined,
          phone: form.phone || undefined,
          trades: form.trades,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Invite failed');
      }
      const data = await res.json();
      setLink(data.inviteUrl || null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addContractor = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          trades: form.trades,
          phone: form.phone || undefined,
          email: form.email || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Failed to add contact');
      }
      const created = await res.json();
      if (form.invite) {
        const invRes = await fetch(`${API_BASE_URL}/professional/contacts/${created.id}/invite`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          setLink(invData.inviteUrl || null);
        }
      }
      await load();
      if (!form.invite) setShowModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (kind === 'worker') await addWorker();
    else await addContractor();
  };

  const revokeInvite = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`${API_BASE_URL}/professional/worker-invites/${id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeContact = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`${API_BASE_URL}/professional/contacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {workers.length + invites.length + contacts.length} people
        </p>
        <button
          type="button"
          onClick={() => openModal('worker')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-[#F5EEDE] hover:bg-emerald-700"
        >
          + Add person
        </button>
      </div>

      {/* Workers */}
      {workers.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workers</p>
          <ul className="mt-1.5 space-y-1.5">
            {workers.map((w) => (
              <li key={w.id} className="rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800">{w.fullName || w.businessName || w.email}</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">worker</span>
                </div>
                {(w.tradesOffered?.length > 0 || w.phone || w.notes) && (
                  <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {w.tradesOffered?.length > 0 && (
                      <p className="flex flex-wrap gap-1">
                        {w.tradesOffered.map((t) => (
                          <span key={t} className="rounded bg-[rgba(185,78,45,0.08)] px-1.5 py-0.5 text-[10px] font-semibold text-[#b94e2d]">{t}</span>
                        ))}
                      </p>
                    )}
                    {w.phone && <p>📞 {w.phone}</p>}
                    {w.notes && <p className="italic">{w.notes}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending worker invites */}
      {invites.filter((i) => i.status === 'pending').length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Worker invites</p>
          <ul className="mt-1.5 space-y-1.5">
            {invites.filter((i) => i.status === 'pending').map((inv) => (
              <li key={inv.id} className="flex items-start justify-between gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{inv.email}</span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">pending</span>
                  </div>
                  {(inv.trades?.length > 0 || inv.phone || inv.notes) && (
                    <div className="mt-1 text-xs text-slate-500">
                      {inv.trades?.length > 0 && (
                        <p className="flex flex-wrap gap-1">
                          {inv.trades.map((t) => (
                            <span key={t} className="rounded bg-[rgba(185,78,45,0.08)] px-1.5 py-0.5 text-[10px] font-semibold text-[#b94e2d]">{t}</span>
                          ))}
                        </p>
                      )}
                      {(inv.phone || inv.notes) && (
                        <p className="mt-0.5">{[inv.phone && `📞 ${inv.phone}`, inv.notes].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revokeInvite(inv.id)}
                  className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contractors */}
      {contacts.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contractors</p>
          <ul className="mt-1.5 space-y-1.5">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusTone[c.inviteStatus] || 'bg-slate-100 text-slate-500'}`}>
                      {c.inviteStatus}
                    </span>
                  </div>
                  {(c.trades.length > 0 || c.phone || c.email || c.notes) && (
                    <div className="mt-1 text-xs text-slate-500">
                      {c.trades.length > 0 && (
                        <p className="flex flex-wrap gap-1">
                          {c.trades.map((t) => (
                            <span key={t} className="rounded bg-[rgba(185,78,45,0.08)] px-1.5 py-0.5 text-[10px] font-semibold text-[#b94e2d]">{t}</span>
                          ))}
                        </p>
                      )}
                      {(c.phone || c.email) && <p className="mt-0.5">{[c.phone && `📞 ${c.phone}`, c.email].filter(Boolean).join(' · ')}</p>}
                      {c.notes && <p className="mt-0.5 italic">{c.notes}</p>}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeContact(c.id)}
                  className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add person modal */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Add person</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

              {/* Worker / contractor toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setKind('worker')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${kind === 'worker' ? 'bg-emerald-600 text-[#F5EEDE]' : 'border border-[#D4C8A0] bg-white text-slate-600'}`}
                >
                  👷 Worker
                </button>
                <button
                  type="button"
                  onClick={() => setKind('contractor')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${kind === 'contractor' ? 'bg-emerald-600 text-[#F5EEDE]' : 'border border-[#D4C8A0] bg-white text-slate-600'}`}
                >
                  🧰 Contractor
                </button>
              </div>

              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={kind === 'worker' ? 'Full name (optional)' : 'Name or company (required)'}
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
              />

              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={kind === 'worker' ? 'Email (required)' : 'Email (optional)'}
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
              />

              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Mobile number"
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
              />

              <div>
                <label className="block text-xs font-medium text-slate-600">Trades (Ctrl/Cmd-click for multiple)</label>
                <select
                  multiple
                  value={form.trades}
                  onChange={(e) => setForm((f) => ({ ...f, trades: Array.from(e.target.selectedOptions, (o) => o.value) }))}
                  className="mt-1 w-full rounded-lg border border-[#D4C8A0] bg-white px-2 py-2 text-sm text-slate-800"
                  size={4}
                >
                  {tradeOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes (optional)"
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
              />

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={kind === 'worker' ? true : form.invite}
                  disabled={kind === 'worker'}
                  onChange={(e) => setForm((f) => ({ ...f, invite: e.target.checked }))}
                  className="h-4 w-4 text-emerald-600"
                />
                Invite to Mimo
              </label>

              {link && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                  <p className="font-semibold text-emerald-800">Invite link created</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-700">{link}</code>
                    <button type="button" onClick={copyLink} className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={save}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-[#F5EEDE] hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? '…' : kind === 'worker' ? 'Invite worker' : form.invite ? 'Add & invite' : 'Add contact'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
