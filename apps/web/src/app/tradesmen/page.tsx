'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Tradesman } from '../../lib/types';
import { ProtectedPageOverlay } from '@/components/protected-page-overlay';
import { tradesmen as fallbackTradesmen } from '@/data/tradesmen';
import {
  SERVICE_TO_PROFESSION,
  matchServiceToProfession,
} from '@/lib/service-matcher';

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {label}
    </span>
  );
}

export default function TradesmenPage() {
  const { isLoggedIn } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [tradesmen, setTradesmen] = useState<Tradesman[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);

  useEffect(() => {
    const fetchTradesmen = async () => {
      const baseUrl = (
        process.env.NEXT_PUBLIC_API_BASE_URL || 'https://fitouthub.onrender.com'
      ).replace(/\/$/, '');

      try {
        const response = await fetch(`${baseUrl}/tradesmen`, { cache: 'no-store' });
        const contentType = response.headers.get('content-type') || '';

        const payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text().then((text) => {
              throw new Error(`Expected JSON, got: ${text.slice(0, 120)}`);
            });

        const data = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { data?: Tradesman[] }).data)
            ? (payload as { data: Tradesman[] }).data
            : [];

        setTradesmen(data.length ? data : fallbackTradesmen);
      } catch (error) {
        console.error('Failed to fetch tradesmen:', error);
        // Fall back to static dataset so the page stays usable
        setTradesmen(fallbackTradesmen);
      } finally {
        setLoading(false);
      }
    };

    if (isLoggedIn) {
      fetchTradesmen();
    } else if (isLoggedIn === false) {
      setLoading(false);
    }
  }, [isLoggedIn]);

  const filterByTerm = (term: string) => {
    const needle = term.trim().toLowerCase();
    const mappedProfession = needle ? matchServiceToProfession(needle) : null;
    if (!needle && !mappedProfession) return tradesmen;

    return tradesmen.filter((trade) => {
      const haystacks = [
        trade.title,
        trade.category,
        trade.description ?? '',
        ...(trade.jobs ?? []),
      ]
        .filter(Boolean)
        .map((s) => s.toLowerCase());

      const textMatch = needle ? haystacks.some((s) => s.includes(needle)) : false;
      const professionMatch = mappedProfession
        ? trade.title.toLowerCase().includes(mappedProfession)
        : false;

      return textMatch || professionMatch || (!needle && mappedProfession);
    });
  };

  const filteredTradesmen = filterByTerm(searchTerm);
  const visibleTrades = filteredTradesmen.slice(0, visibleCount);

  const suggestionPool = Array.from(
    new Set([
      ...tradesmen.map((t) => t.title),
      ...tradesmen.flatMap((t) => t.jobs ?? []),
      ...Object.keys(SERVICE_TO_PROFESSION),
    ])
  ).sort();

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setVisibleCount(6); // reset pagination on new search

    const trimmed = value.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const lower = trimmed.toLowerCase();
    const matches = suggestionPool.filter((s) => s.toLowerCase().includes(lower)).slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  };

  const handleSuggestionSelect = (value: string) => {
    setSearchTerm(value);
    setShowSuggestions(false);
    setVisibleCount(6);
  };

  return (
    <>
      {/* Protected page overlay */}
      <ProtectedPageOverlay
        onJoinClick={openJoinModal}
        onLoginClick={openLoginModal}
      />

      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Browse trades
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Tradesmen by specialty</h1>
          <p className="text-sm text-slate-600">
            Static preview pulled from seed data. API endpoint coming next.
          </p>
        </div>

        {/* Search + typeahead */}
        <div className="relative w-full max-w-xl">
          <label className="text-sm text-slate-600">Search by trade or service</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setShowSuggestions(suggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
            placeholder="e.g. plumber, AC servicing, electrician"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none"
          />
          {showSuggestions && suggestions.length > 0 ? (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSuggestionSelect(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Loading tradesmen...
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTrades.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No matching trades found.
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{trade.title}</div>
                          <div className="text-xs text-slate-600">{trade.category}</div>
                        </div>
                        {trade.featured ? <Badge label="Featured" /> : null}
                      </div>
                      <p className="mt-3 text-sm text-slate-700 line-clamp-3">
                        {trade.description}
                      </p>
                      <div className="mt-4 space-y-1 text-xs text-slate-600">
                        {trade.jobs.slice(0, 4).map((job: string) => (
                          <div key={job} className="flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-slate-400" />
                            <span>{job}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {visibleCount < filteredTradesmen.length ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400"
                      onClick={() => setVisibleCount((c) => c + 6)}
                    >
                      Show more
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
