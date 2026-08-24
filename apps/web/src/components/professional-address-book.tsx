'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { tradesmen as fallbackTradesmen } from '@/data/tradesmen';

type Contact = {
  id: string;
  name: string;
  trades: string[];
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  inviteStatus: string;
  linkedProfessionalId?: string | null;
};

const statusTone: Record<string, string> = {
  external: 'bg-slate-100 text-slate-500',
  invited: 'bg-amber-100 text-amber-700',
  joined: 'bg-emerald-100 text-emerald-700',
};

export function ProfessionalAddressBook({ accessToken }: { accessToken: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', trades: [] as string[], phone: '', email: '', notes: '' });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/professional/contacts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = res.ok ? await res.json() : [];
      setContacts(Array.isArray(data) ? data : []);
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
            ? data
                .map((t: any) => (typeof t === 'string' ? t : t.title || t.name || t.label))
                .filter(Boolean)
                .sort()
            : [];
        }
      } catch {
        /* fall through to fallback */
      }
      if (names.length === 0) {
        names = fallbackTradesmen.map((t) => t.title).filter(Boolean).sort();
      }
      setTradeOptions(names);
    })();
  }, []);

  const resetForm = () => {
    setForm({ name: '', trades: [], phone: '', email: '', notes: '' });
    setEditingId(null);
  };

  const startEdit = (c: Contact) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      trades: c.trades || [],
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || '',
    });
    setError(null);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/professional/contacts${editingId ? `/${editingId}` : ''}`,
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
        throw new Error(e.message || 'Save failed');
      }
      resetForm();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
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

  const invite = async (id: string) => {
    setBusy(true);
    setError(null);
    setInviteUrl(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/contacts/${id}/invite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Invite failed');
      }
      const data = await res.json();
      setInviteUrl(data.inviteUrl || null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
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

      {/* Add / edit form */}
      <div className="rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-700">
          {editingId ? 'Edit contact' : 'Add a contractor'}
        </p>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Name or company"
          className="w-full rounded-lg border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[rgba(185,78,45,0.5)]"
        />
        <div>
          <label className="block text-xs font-medium text-slate-600">Trades (Ctrl/Cmd-click for multiple)</label>
          <select
            multiple
            value={form.trades}
            onChange={(e) =>
              setForm((f) => ({ ...f, trades: Array.from(e.target.selectedOptions, (o) => o.value) }))
            }
            className="mt-1 w-full rounded-lg border border-[rgba(120,53,15,0.14)] bg-white px-2 py-2 text-sm text-slate-800 outline-none focus:border-[rgba(185,78,45,0.5)]"
            size={4}
          >
            {tradeOptions.map((trade) => (
              <option key={trade} value={trade}>
                {trade}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Phone"
            className="rounded-lg border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[rgba(185,78,45,0.5)]"
          />
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            className="rounded-lg border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[rgba(185,78,45,0.5)]"
          />
        </div>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Notes (optional)"
          className="w-full rounded-lg border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[rgba(185,78,45,0.5)]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50"
          >
            {busy ? '…' : editingId ? 'Save' : 'Add contact'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-[rgba(120,53,15,0.2)] px-4 py-2 text-sm font-medium text-slate-600 hover:bg-[rgba(245,238,219,0.9)]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {inviteUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
          <p className="font-semibold text-emerald-800">Invite link created</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[10px] text-emerald-700">{inviteUrl}</code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Contacts list */}
      {contacts.length === 0 ? (
        <p className="text-xs text-slate-500">No contractors added yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusTone[c.inviteStatus] || 'bg-slate-100 text-slate-500'}`}>
                    {c.inviteStatus}
                  </span>
                </div>
                {c.trades.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.trades.map((t) => (
                      <span key={t} className="rounded bg-[rgba(185,78,45,0.08)] px-1.5 py-0.5 text-[10px] font-semibold text-[#b94e2d]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {(c.phone || c.email) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[c.phone, c.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!c.linkedProfessionalId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => invite(c.id)}
                    className="rounded border border-[rgba(120,53,15,0.2)] px-2 py-0.5 text-[11px] font-semibold text-[#b94e2d] hover:bg-[rgba(185,78,45,0.06)] disabled:opacity-50"
                  >
                    Invite
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => startEdit(c)}
                  className="rounded border border-[rgba(120,53,15,0.2)] px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-[rgba(245,238,219,0.9)] disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(c.id)}
                  className="rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
