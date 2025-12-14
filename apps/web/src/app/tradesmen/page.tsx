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
    <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
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
  const [showAllTrades, setShowAllTrades] = useState(false);

  useEffect(() => {
    const fetchTradesmen = async () => {
      const baseUrl = (
        process.env.NEXT_PUBLIC_API_BASE_URL || 'https://fitouthub.onrender.com'
      ).replace(/\/$/, '');

      try {
        const response = await fetch(`${baseUrl}/tradesmen`, { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
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

        console.log(`Fetched ${data.length} tradesmen from API`);
        setTradesmen(data.length ? data : fallbackTradesmen);
      } catch (error) {
        console.error('Failed to fetch tradesmen:', error);
        console.log(`Using fallback data with ${fallbackTradesmen.length} trades`);
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
  
  // When searching, show all matching trades; otherwise show featured first, then allow reveal all
  const displayedTrades = searchTerm 
    ? filteredTradesmen 
    : showAllTrades 
      ? filteredTradesmen 
      : filteredTradesmen.filter((t) => t.featured);

  const suggestionPool = Array.from(
    new Set([
      ...tradesmen.map((t) => t.title),
      ...tradesmen.flatMap((t) => t.jobs ?? []),
      ...Object.keys(SERVICE_TO_PROFESSION),
    ])
  ).sort();

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setShowAllTrades(false); // reset when searching

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
    setShowAllTrades(false);
  };

  return (
    <>
      {/* Protected page overlay */}
      <ProtectedPageOverlay
        onJoinClick={openJoinModal}
        onLoginClick={openLoginModal}
      />

      <div className="space-y-8">
        {/* Compact Hero Section */}
        <section className="relative rounded-xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white py-6 px-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-400">
              Browse Trades
            </p>
            <h1 className="text-2xl font-bold">
              Find Expert Tradesmen for Any Job
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Discover specialized tradesmen across multiple categories. Filter by skill and expertise.
            </p>
          </div>
        </section>

        {/* Search Section Header */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">
            Search & Filter
          </p>
          <h2 className="text-2xl font-bold text-slate-900">Narrow your search</h2>
        </div>

        {/* Search + typeahead */}
        <div className="relative w-full max-w-xl">
          <label className="text-sm text-slate-600">Search by trade or service</label>
          <div className="relative mt-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
              placeholder="e.g. plumber, AC servicing, electrician"
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 shadow-sm focus:border-slate-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                aria-label="Clear search"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
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
            {displayedTrades.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No matching trades found.
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayedTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition hover:-translate-y-1 hover:shadow-md"
                    >
                      {/* Card Header with Dark Background */}
                      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-4 text-white">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <h3 className="text-base font-bold text-white">{trade.title}</h3>
                            <p className="text-xs font-semibold text-emerald-400 mt-1 uppercase tracking-wide">{trade.category}</p>
                          </div>
                          {trade.featured && <Badge label="Featured" />}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="flex-1 p-4 space-y-3">
                        <p className="text-sm text-slate-700 line-clamp-2">
                          {trade.description}
                        </p>

                        {/* Job Tags */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Specialties</p>
                          <div className="flex flex-wrap gap-2">
                            {trade.jobs.slice(0, 3).map((job: string) => (
                              <span
                                key={job}
                                className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
                              >
                                {job}
                              </span>
                            ))}
                            {trade.jobs.length > 3 && (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                +{trade.jobs.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {!searchTerm && !showAllTrades && filteredTradesmen.length > displayedTrades.length && (
                  <div className="flex justify-center pt-4">
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition"
                      onClick={() => setShowAllTrades(true)}
                    >
                      Show all {filteredTradesmen.length} trades
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
