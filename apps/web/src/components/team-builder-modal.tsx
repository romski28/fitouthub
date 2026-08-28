'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

export interface SubcontractEntry {
  trade: string;
  kind: string;
  amount?: number | string;
  labour?: number | string;
  supplies?: number | string;
  other?: number | string;
  otherNotes?: string;
  contactId?: string | null;
  professionalId?: string | null;
  b2bCost?: number | string | null;
  multiplier?: number | string | null;
  status?: string;
  name?: string;
}

interface Contact {
  id: string;
  name: string;
  trades?: string[];
  type?: string;
}

interface PlatformPro {
  id: string;
  fullName?: string;
  businessName?: string;
  primaryTrade?: string;
  tradesOffered?: string[];
  locationPrimary?: string;
  locationSecondary?: string;
  professionType?: string;
  local?: boolean;
}

interface TeamBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectProfessionalId: string;
  accessToken: string;
  subcontracting: SubcontractEntry[] | null | undefined;
  projectName?: string;
  region?: string;
  isAwarded?: boolean;
  onSaved?: (next: SubcontractEntry[]) => void;
}

const displayName = (pro: PlatformPro) =>
  pro.businessName || pro.fullName || 'A professional';

export function TeamBuilderModal({
  isOpen,
  onClose,
  projectProfessionalId,
  accessToken,
  subcontracting,
  projectName,
  region,
  isAwarded = false,
  onSaved,
}: TeamBuilderModalProps) {
  const [entries, setEntries] = useState<SubcontractEntry[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PlatformPro[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchForTrade, setSearchForTrade] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSearchResults([]);
    setSearchForTrade(null);
    if (!projectProfessionalId || !accessToken) return;

    fetch(`${API_BASE_URL}/professional/projects/${projectProfessionalId}/quote-scope`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const tradesRequired: string[] = Array.isArray(data.tradesRequired)
          ? data.tradesRequired
          : [];
        const selfTrades: string[] = Array.isArray(data.selfTrades) ? data.selfTrades : [];
        if (Array.isArray(data.contacts)) setContacts(data.contacts);
        const existingPlan: SubcontractEntry[] = Array.isArray(data.subcontracting)
          ? data.subcontracting
          : Array.isArray(subcontracting)
            ? subcontracting
            : [];
        const planByTrade = new Map<string, SubcontractEntry>(
          existingPlan.map((e) => [e.trade, e]),
        );
        setEntries(
          tradesRequired.map((trade) => {
            const existing = planByTrade.get(trade);
            if (existing) return { ...existing, trade };
            const isSelf = selfTrades.includes(trade);
            return { trade, kind: isSelf ? 'self' : 'tbc', status: isSelf ? 'defined' : 'tbc' };
          }),
        );
      })
      .catch(() => {
        /* best-effort */
      });
  }, [isOpen, projectProfessionalId, accessToken, subcontracting]);

  const runSearch = useCallback(
    async (q: string, trade?: string) => {
      if (!accessToken) return;
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q && q.trim()) params.set('q', q.trim());
        if (trade && trade.trim()) params.set('trade', trade.trim());
        if (region && region.trim()) params.set('region', region.trim());
        const res = await fetch(`${API_BASE_URL}/professional/team/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data?.pros) ? data.pros : []);
        }
      } finally {
        setSearching(false);
      }
    },
    [accessToken, region],
  );

  const assign = (trade: string, kind: 'self' | 'contact' | 'tbc', contactId?: string | null) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.trade !== trade) return e;
        const contact = kind === 'contact' ? contacts.find((c) => c.id === contactId) : null;
        return {
          ...e,
          kind,
          contactId: kind === 'contact' ? contactId || null : null,
          professionalId: null,
          status: kind === 'tbc' ? 'tbc' : 'defined',
          name: kind === 'contact' && contact ? contact.name : undefined,
        };
      }),
    );
  };

  const assignPro = (trade: string, pro: PlatformPro) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.trade === trade
          ? { ...e, kind: 'platform', professionalId: pro.id, contactId: null, status: 'defined', name: displayName(pro) }
          : e,
      ),
    );
    setSearchForTrade(null);
    setSearch('');
    setSearchResults([]);
  };

  const save = async () => {
    if (!accessToken || !projectProfessionalId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/subcontracting`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subcontracting: entries }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to save team');
      }
      toast.success('Team updated.');
      onSaved?.(entries);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(120,53,15,0.12)] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Build your team</h2>
            {projectName ? <p className="text-xs text-slate-500">{projectName}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full border border-[#D4C8A0] bg-white text-lg font-semibold text-slate-600 transition hover:bg-slate-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="next-step-scrollbar max-h-[65vh] overflow-y-auto px-5 py-4 space-y-3">
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">Loading trades…</p>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                Assign who delivers each trade — yourself, a personal contact, or a platform
                professional. These are subcontractors, not platform workers with access.
              </p>
              {entries.map((entry) => {
                const assignedContact =
                  entry.kind === 'contact' && entry.contactId
                    ? contacts.find((c) => c.id === entry.contactId)
                    : null;
                const selectValue =
                  entry.kind === 'self'
                    ? 'self'
                    : entry.kind === 'contact'
                      ? entry.contactId || 'tbc'
                      : 'tbc';
                return (
                  <div key={entry.trade} className="rounded-lg border border-[rgba(120,53,15,0.16)] bg-white/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{entry.trade}</span>
                      {typeof entry.amount === 'number' && entry.amount > 0 ? (
                        <span className="text-xs text-slate-500">
                          HK${Number(entry.amount).toLocaleString()}
                        </span>
                      ) : null}
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          entry.status === 'defined'
                            ? 'bg-emerald-600 text-[#F5EEDE]'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {entry.kind === 'self' ? 'Self' : entry.status === 'defined' ? 'Assigned' : 'TBC'}
                      </span>
                    </div>

                    {isAwarded ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {entry.kind === 'self'
                          ? 'Delivered by you'
                          : entry.kind === 'platform'
                            ? `🤝 ${entry.name || 'Platform professional'}`
                            : assignedContact
                              ? assignedContact.name
                              : 'Not assigned'}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <select
                          value={selectValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'self') assign(entry.trade, 'self');
                            else if (v === 'tbc') assign(entry.trade, 'tbc');
                            else assign(entry.trade, 'contact', v);
                          }}
                          className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none focus:border-amber-500"
                        >
                          <option value="self">👤 Self (I'll deliver it)</option>
                          {contacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.type === 'worker' ? '👷' : '🧑‍🔧'} {c.name}
                            </option>
                          ))}
                          <option value="tbc">Not assigned yet</option>
                        </select>

                        {entry.kind === 'platform' ? (
                          <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
                            <span className="font-semibold text-emerald-800">🤝 {entry.name || 'Platform professional'}</span>
                            <button
                              type="button"
                              onClick={() => assign(entry.trade, 'tbc')}
                              className="text-xs font-semibold text-slate-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}

                        <div>
                          {searchForTrade === entry.trade ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <input
                                  autoFocus
                                  value={search}
                                  onChange={(e) => setSearch(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') runSearch(search, entry.trade);
                                  }}
                                  placeholder={`Filter ${entry.trade.toLowerCase()} pros…`}
                                  className="flex-1 rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none focus:border-amber-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => runSearch(search, entry.trade)}
                                  className="rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                >
                                  Search
                                </button>
                              </div>
                              {searching ? (
                                <p className="text-xs text-slate-500">Searching…</p>
                              ) : (
                                <div className="space-y-1">
                                  {searchResults.map((pro) => (
                                    <button
                                      key={pro.id}
                                      type="button"
                                      onClick={() => assignPro(entry.trade, pro)}
                                      className="flex w-full items-center justify-between rounded-lg border border-[rgba(120,53,15,0.14)] bg-white px-3 py-2 text-left text-sm transition hover:bg-[#F5EEDE]"
                                    >
                                      <span>
                                        <span className="font-semibold text-slate-800">{displayName(pro)}</span>
                                        {pro.local ? (
                                          <span className="ml-1" title="Local">📍</span>
                                        ) : null}
                                        {pro.professionType === 'company' ? (
                                          <span className="ml-1" title="Company">🏢</span>
                                        ) : (
                                          <span className="ml-1" title="Contractor">👷</span>
                                        )}
                                        {pro.primaryTrade ? (
                                          <span className="ml-1 text-xs text-slate-500">· {pro.primaryTrade}</span>
                                        ) : null}
                                      </span>
                                      <span className="text-xs font-semibold text-emerald-700">Select</span>
                                    </button>
                                  ))}
                                  {searchResults.length === 0 && (
                                    <p className="text-xs text-slate-500">No matching pros.</p>
                                  )}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchForTrade(null);
                                  setSearch('');
                                  setSearchResults([]);
                                }}
                                className="text-xs font-semibold text-slate-500 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchForTrade(entry.trade);
                                void runSearch('', entry.trade);
                              }}
                              className="text-xs font-semibold text-emerald-700 hover:underline"
                            >
                              + Find a platform professional
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[rgba(120,53,15,0.12)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          {!isAwarded && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save team'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
