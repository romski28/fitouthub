'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

export interface SubcontractEntry {
  trade: string;
  kind: string;
  amount?: number | string;
  contactId?: string | null;
  professionalId?: string | null;
  b2bCost?: number | string | null;
  multiplier?: number | string | null;
  status?: string;
}

interface Contact {
  id: string;
  name: string;
  trades?: string[];
}

interface PlatformPro {
  id: string;
  fullName?: string;
  businessName?: string;
  primaryTrade?: string;
  tradesOffered?: string[];
  locationPrimary?: string;
  locationSecondary?: string;
}

interface TeamBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectProfessionalId: string;
  accessToken: string;
  subcontracting: SubcontractEntry[] | null | undefined;
  projectName?: string;
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
    if (isOpen) {
      const nonSelf = (subcontracting || []).filter((e) => e.kind !== 'self');
      setEntries(nonSelf.map((e) => ({ ...e })));
      setSearch('');
      setSearchResults([]);
      setSearchForTrade(null);
    }
  }, [isOpen, subcontracting]);

  useEffect(() => {
    if (!isOpen || !projectProfessionalId || !accessToken) return;
    fetch(`${API_BASE_URL}/professional/projects/${projectProfessionalId}/quote-scope`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.contacts) setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      })
      .catch(() => {
        /* best-effort */
      });
  }, [isOpen, projectProfessionalId, accessToken]);

  const runSearch = useCallback(
    async (q: string, trade?: string) => {
      if (!accessToken) return;
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q && q.trim()) params.set('q', q.trim());
        if (trade && trade.trim()) params.set('trade', trade.trim());
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
    [accessToken],
  );

  const assignContact = (trade: string, contactId: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.trade === trade
          ? {
              ...e,
              kind: contactId ? 'contact' : 'tbc',
              contactId: contactId || null,
              professionalId: null,
              status: contactId ? 'defined' : 'tbc',
            }
          : e,
      ),
    );
  };

  const assignPro = (trade: string, pro: PlatformPro) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.trade === trade
          ? { ...e, kind: 'platform', professionalId: pro.id, contactId: null, status: 'defined' }
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
      const selfEntries = (subcontracting || []).filter((e) => e.kind === 'self');
      const fullPlan = [...selfEntries, ...entries];
      const res = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/subcontracting`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subcontracting: fullPlan }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to save team');
      }
      toast.success('Team updated.');
      onSaved?.(fullPlan);
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
            <h2 className="text-lg font-bold text-slate-900">Define your team</h2>
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
            <p className="py-6 text-center text-sm text-slate-600">
              No additional trades to assign — you are covering the whole project yourself.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                Assign who will deliver each additional trade. These are your subcontractors, not
                platform workers with access.
              </p>
              {entries.map((entry) => {
                const assignedContact = entry.contactId
                  ? contacts.find((c) => c.id === entry.contactId)
                  : null;
                const assignedName = entry.kind === 'platform'
                  ? (() => {
                      // We don't keep pro names in the stored plan, so show a generic label.
                      return 'Platform professional';
                    })()
                  : assignedContact?.name;
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
                        {entry.status === 'defined' ? 'Assigned' : 'TBC'}
                      </span>
                    </div>

                    {isAwarded ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {assignedName || 'Not assigned'}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <select
                          value={entry.contactId || ''}
                          onChange={(e) => assignContact(entry.trade, e.target.value)}
                          className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none focus:border-amber-500"
                        >
                          <option value="">Not assigned yet</option>
                          {contacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
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
                                  placeholder="Search platform pros…"
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
                              onClick={() => setSearchForTrade(entry.trade)}
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
