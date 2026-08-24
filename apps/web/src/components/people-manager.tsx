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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<'worker' | 'contractor' | null>(null);

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
    setEditingId(null);
    setEditingKind(null);
    setForm({ name: '', email: '', phone: '', trades: [], notes: '', invite: k === 'worker' });
    setError(null);
    setLink(null);
    setShowModal(true);
  };

  const openEdit = (
    k: 'worker' | 'contractor',
    p: { id: string; name: string; email: string | null; phone: string | null; trades: string[]; notes: string | null },
  ) => {
    setKind(k);
    setEditingId(p.id);
    setEditingKind(k);
    setForm({ name: p.name, email: p.email || '', phone: p.phone || '', trades: p.trades || [], notes: p.notes || '', invite: false });
    setError(null);
    setLink(null);
    setShowModal(true);
  };

  const save = async () => {
    if (kind === 'worker') {
      if (!editingId && !form.email.trim()) {
        setError('Email is required');
        return;
      }
      setBusy(true);
      setError(null);
      setLink(null);
      try {
        const res = await fetch(
          editingId
            ? `${API_BASE_URL}/professional/workers/${editingId}`
            : `${API_BASE_URL}/professional/worker-invites`,
          {
            method: editingId ? 'PUT' : 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email,
              name: form.name || undefined,
              phone: form.phone || undefined,
              trades: form.trades,
              notes: form.notes || undefined,
            }),
          },
        );
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.message || (editingId ? 'Update failed' : 'Invite failed'));
        }
        if (!editingId) {
          const data = await res.json();
          setLink(data.inviteUrl || null);
        }
        await load();
        if (editingId) setShowModal(false);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch(
        editingId ? `${API_BASE_URL}/professional/contacts/${editingId}` : `${API_BASE_URL}/professional/contacts`,
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            trades: form.trades,
            phone: form.phone || undefined,
            email: form.email || undefined,
            notes: form.notes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Failed to save contact');
      }
      const savedId = editingId || (await res.json()).id;
      if (form.invite && savedId) {
        const invRes = await fetch(`${API_BASE_URL}/professional/contacts/${savedId}/invite`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          setLink(invData.inviteUrl || null);
        }
      }
      await load();
      if (editingId || !form.invite) setShowModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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

  const people: {
    key: string;
    kind: 'worker' | 'contractor';
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    trades: string[];
    notes: string | null;
  }[] = [
    ...workers.map((w) => ({
      key: `w-${w.id}`,
      kind: 'worker' as const,
      id: w.id,
      name: w.fullName || w.businessName || w.email,
      email: w.email,
      phone: w.phone,
      trades: w.tradesOffered || [],
      notes: w.notes,
    })),
    ...contacts.map((c) => ({
      key: `c-${c.id}`,
      kind: 'contractor' as const,
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      trades: c.trades || [],
      notes: c.notes,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

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

      {/* People (workers + contractors) */}
      {people.length > 0 && (
        <ul className="space-y-1.5">
          {people.map((p) => {
            const visibleTrades = p.trades.slice(0, 3);
            const extraTrades = p.trades.length - visibleTrades.length;
            return (
              <li key={p.key} className="flex items-center gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => openEdit(p.kind, p)}
                  className="shrink-0 text-left font-medium text-slate-800 underline-offset-2 hover:underline"
                >
                  {p.name}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-500">
                    {[p.email, p.phone && `📞 ${p.phone}`].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {visibleTrades.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {visibleTrades.map((t) => (
                        <span key={t} className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-[#F5EEDE]">{t}</span>
                      ))}
                      {extraTrades > 0 && (
                        <span className="rounded-full bg-emerald-600/80 px-2 py-0.5 text-xs font-semibold text-[#F5EEDE]">+{extraTrades}</span>
                      )}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${p.kind === 'worker' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#FF7F50]/10 text-[#b94e2d]'}`}>
                  {p.kind === 'worker' ? 'worker' : 'contractor'}
                </span>
              </li>
            );
          })}
        </ul>
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
                            <span key={t} className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-[#F5EEDE]">{t}</span>
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

      {/* Add person modal */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit person' : 'Add person'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

              {/* Worker / contractor toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!editingId}
                  onClick={() => setKind('worker')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed ${kind === 'worker' ? 'bg-emerald-600 text-[#F5EEDE]' : 'border border-[#D4C8A0] bg-white text-slate-600'}`}
                >
                  👷 Worker
                </button>
                <button
                  type="button"
                  disabled={!!editingId}
                  onClick={() => setKind('contractor')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed ${kind === 'contractor' ? 'bg-emerald-600 text-[#F5EEDE]' : 'border border-[#D4C8A0] bg-white text-slate-600'}`}
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
                disabled={!!editingId && kind === 'worker'}
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d] disabled:bg-slate-100 disabled:text-slate-400"
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
                {editingId && editingKind === 'contractor' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { void removeContact(editingId); setShowModal(false); }}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={save}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-[#F5EEDE] hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? '…' : editingId ? 'Save' : kind === 'worker' ? 'Invite worker' : form.invite ? 'Add & invite' : 'Add contact'}
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
