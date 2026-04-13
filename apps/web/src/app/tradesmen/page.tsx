'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Tradesman } from '../../lib/types';
import { tradesmen as fallbackTradesmen } from '@/data/tradesmen';
import { API_BASE_URL } from '@/config/api';
import { ModalOverlay } from '@/components/modal-overlay';
import {
  SERVICE_TO_PROFESSION,
  matchServiceToProfession,
} from '@/lib/service-matcher';

type TradeApiRecord = Tradesman & {
  professionType?: string;
  aliases?: string[];
  enabled?: boolean;
  usageCount?: number;
};

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
      {label}
    </span>
  );
}

export default function TradesmenPage() {
  const t = useTranslations('tradesmen');
  const locale = useLocale();
  const { isLoggedIn, userLocation } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [tradesmen, setTradesmen] = useState<Tradesman[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<TradeApiRecord | null>(null);

  useEffect(() => {
    const fetchTradesmen = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/trades?locale=${encodeURIComponent(locale === 'zh-HK' ? 'zh-HK' : 'en')}`,
          { cache: 'no-store' },
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text().then((text) => {
              throw new Error(`Expected JSON, got: ${text.slice(0, 120)}`);
            });

        const rawData = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { data?: Tradesman[] }).data)
            ? (payload as { data: Tradesman[] }).data
            : [];

        const data: TradeApiRecord[] = (rawData as Array<{
          id: string;
          name?: string;
          title?: string;
          category?: string;
          professionType?: string;
          aliases?: string[];
          description?: string;
          featured?: boolean;
          enabled?: boolean;
          usageCount?: number;
          jobs?: string[];
          image?: string;
        }>).map((trade) => ({
          id: trade.id,
          title: trade.name || trade.title || 'Unknown Trade',
          category: trade.category || 'general',
          professionType: trade.professionType,
          aliases: Array.isArray(trade.aliases) ? trade.aliases : [],
          description: trade.description,
          featured: Boolean(trade.featured),
          enabled: trade.enabled,
          usageCount: trade.usageCount,
          jobs: Array.isArray(trade.jobs) ? trade.jobs : [],
          image: trade.image,
        }));

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

    fetchTradesmen();
  }, [locale]);  // refetch when locale changes

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

  const preferredRegion = userLocation?.tertiary || userLocation?.secondary || userLocation?.primary || undefined;

  return (
    <>
      <div className="browse-page-shell">
        <div className="browse-page-inner">
          <div className="browse-page-stack">
        {/* Compact Hero Section */}
        <section className="relative rounded-xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white py-6 px-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-400">
              {t('hero.tagline')}
            </p>
            <h1 className="text-2xl font-bold">
              {t('hero.title')}
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              {t('hero.description')}
            </p>
          </div>
        </section>

        {/* Search Section Header */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">
            {t('search.tagline')}
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{t('search.title')}</h2>
        </div>

        {/* Search + typeahead */}
        <div className="relative w-full max-w-xl">
          <label className="text-sm text-slate-600">{t('search.label')}</label>
          <div className="relative mt-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
              placeholder={t('search.placeholder')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 shadow-sm focus:border-slate-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                aria-label={t('search.clearAria')}
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
            {t('states.loading')}
          </div>
        ) : (
          <div className="space-y-4">
            {displayedTrades.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                {t('states.empty')}
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayedTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="browse-card group"
                    >
                      {/* Card Header with Dark Background */}
                      <div className="browse-card-header">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <h3 className="text-base font-bold text-white">{trade.title}</h3>
                            <p className="text-xs font-semibold text-emerald-400 mt-1 uppercase tracking-wide">{trade.category}</p>
                          </div>
                          {trade.featured && <Badge label={t('card.featured')} />}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="browse-card-body">
                        <p className="text-sm text-slate-700 line-clamp-2">
                          {trade.description}
                        </p>

                        {/* Job Tags */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('card.specialties')}</p>
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
                                {t('card.more', { count: trade.jobs.length - 3 })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedTrade(trade)}
                            className="browse-card-button browse-card-button-secondary"
                          >
                            {t('card.viewDetails')}
                          </button>

                          {isLoggedIn ? (
                            <Link
                              href={{
                                pathname: '/professionals',
                                query: {
                                  trade: trade.title,
                                  ...(preferredRegion && { location: preferredRegion }),
                                },
                              }}
                              className="browse-card-button browse-card-button-primary"
                            >
                              {t('card.seeInArea', { trade: trade.title.toLowerCase() })}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={openJoinModal}
                              className="browse-card-button browse-card-button-primary"
                            >
                              {t('card.joinCta')}
                            </button>
                          )}
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
                      {t('actions.showAll', { count: filteredTradesmen.length })}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      <TradeDetailsDrawer
        trade={selectedTrade}
        onClose={() => setSelectedTrade(null)}
        regionLabel={preferredRegion}
      />
    </>
  );
}

function TradeDetailsDrawer({
  trade,
  onClose,
  regionLabel,
}: {
  trade: TradeApiRecord | null;
  onClose: () => void;
  regionLabel?: string;
}) {
  if (!trade) return null;

  const genericImage = '/assets/images/chatbot-avatar-icon.webp';

  return (
    <ModalOverlay isOpen={Boolean(trade)} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white sm:flex-row sm:items-center">
          <img
            src={genericImage}
            alt={`${trade.title} avatar`}
            className="h-20 w-20 rounded-xl border border-white/10 bg-white/10 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">Trade Details</p>
            <h2 className="mt-1 text-2xl font-bold">{trade.title}</h2>
            <p className="mt-1 text-sm text-slate-200">
              {[trade.category, trade.professionType].filter(Boolean).join(' • ') || 'Trade overview'}
            </p>
          </div>
          {typeof trade.usageCount === 'number' ? (
            <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-emerald-200">
              {trade.usageCount} uses
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <TradeStat label="Category" value={trade.category || 'General'} />
          <TradeStat label="Profession Type" value={trade.professionType || 'Mixed'} />
          <TradeStat label="Specialties" value={trade.jobs?.length || 0} />
        </div>

        {trade.description ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">About this trade</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{trade.description}</p>
          </div>
        ) : null}

        {trade.jobs && trade.jobs.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Specialties</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {trade.jobs.map((job) => (
                <span key={`${trade.id}-${job}`} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  {job}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {trade.aliases && trade.aliases.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Also known as</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {trade.aliases.map((alias) => (
                <span key={`${trade.id}-alias-${alias}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {alias}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {regionLabel
            ? `When you continue to professionals, we will pre-fill your saved area (${regionLabel}) alongside this trade.`
            : 'When you continue to professionals, we will carry this trade into the professional shortlist.'}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function TradeStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
