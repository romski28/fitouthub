'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPrimaries, getSecondaries, getTerciaries } from '@/lib/location-matcher';
import { searchLocations, LocationSearchResult } from '@/lib/location-search';

export interface CanonicalLocation {
  primary?: string;
  secondary?: string;
  tertiary?: string;
}

export interface LocationSelectProps {
  value?: CanonicalLocation;
  onChange?: (loc: CanonicalLocation) => void;
  disabled?: boolean;
  className?: string;
  labels?: { primary?: string; secondary?: string; tertiary?: string };
  enableSearch?: boolean;
}

export default function LocationSelect({
  value,
  onChange,
  disabled,
  className,
  labels,
  enableSearch = false,
}: LocationSelectProps) {
  const [primary, setPrimary] = useState<string | undefined>(value?.primary);
  const [secondary, setSecondary] = useState<string | undefined>(value?.secondary);
  const [tertiary, setTertiary] = useState<string | undefined>(value?.tertiary);

  useEffect(() => {
    setPrimary(value?.primary);
    setSecondary(value?.secondary);
    setTertiary(value?.tertiary);
  }, [value?.primary, value?.secondary, value?.tertiary]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const primaries = useMemo(() => getPrimaries(), []);
  const secondaries = useMemo(() => (primary ? getSecondaries(primary) : []), [primary]);
  const tertiaries = useMemo(() => (primary && secondary ? getTerciaries(primary, secondary) : []), [primary, secondary]);

  // Search results
  const searchResults = useMemo(() => {
    if (!enableSearch || !searchQuery.trim()) return [];
    return searchLocations(searchQuery, 8);
  }, [searchQuery, enableSearch]);

  // Emit changes
  const handlePrimaryChange = (newPrimary: string | undefined) => {
    setPrimary(newPrimary);
    setSecondary(undefined);
    setTertiary(undefined);
    if (onChange) onChange({ primary: newPrimary, secondary: undefined, tertiary: undefined });
  };

  const handleSecondaryChange = (newSecondary: string | undefined) => {
    setSecondary(newSecondary);
    setTertiary(undefined);
    if (onChange) onChange({ primary, secondary: newSecondary, tertiary: undefined });
  };

  const handleTertiaryChange = (newTertiary: string | undefined) => {
    setTertiary(newTertiary);
    if (onChange) onChange({ primary, secondary, tertiary: newTertiary });
  };

  const handleSearchSelect = (result: LocationSearchResult) => {
    setPrimary(result.primary);
    setSecondary(result.secondary);
    setTertiary(result.tertiary);
    setSearchQuery('');
    setSearchOpen(false);
    if (onChange) onChange({ primary: result.primary, secondary: result.secondary, tertiary: result.tertiary });
  };

  const handleSearchInput = (query: string) => {
    setSearchQuery(query);
    setSearchOpen(true);

    // Show search results when user types
    if (!query.trim()) {
      setSearchOpen(false);
    }
  };

  return (
    <div className={className ?? 'grid gap-4'}>
      {enableSearch && (
        <div className="relative">
          <label className="text-sm font-medium text-gray-700 block mb-2">Search Location (Optional)</label>
          <input
            type="text"
            placeholder="Type to search... (e.g., 'Mong Kok', 'TST', 'Central')"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => searchQuery && setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            disabled={disabled}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />

          {/* Search results dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-10">
              {searchResults.map((result, idx) => (
                <button
                  key={`${idx}-${result.primary}-${result.secondary}-${result.tertiary}`}
                  type="button"
                  onClick={() => handleSearchSelect(result)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm border-b border-slate-100 last:border-b-0"
                >
                  <div className="font-medium">{result.display}</div>
                  <div className="text-xs text-slate-500">
                    {result.primary}
                    {result.secondary && ` > ${result.secondary}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Primary Region Selector */}
      <div className="grid gap-1">
        <label className="text-sm font-medium text-gray-700">{labels?.primary ?? 'Region'}</label>
        <select
          value={primary ?? ''}
          onChange={(e) => handlePrimaryChange(e.target.value || undefined)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          disabled={disabled}
        >
          <option value="">Select region</option>
          {primaries.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Secondary District Selector (hidden until primary selected) */}
      {primary && (
        <div className="grid gap-1 animate-in fade-in slide-in-from-top-2">
          <label className="text-sm font-medium text-gray-700">{labels?.secondary ?? 'District'}</label>
          <select
            value={secondary ?? ''}
            onChange={(e) => handleSecondaryChange(e.target.value || undefined)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            disabled={disabled}
          >
            <option value="">Select district</option>
            {secondaries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tertiary Area Selector (hidden until secondary selected) */}
      {secondary && (
        <div className="grid gap-1 animate-in fade-in slide-in-from-top-2">
          <label className="text-sm font-medium text-gray-700">{labels?.tertiary ?? 'Area'}</label>
          <select
            value={tertiary ?? ''}
            onChange={(e) => handleTertiaryChange(e.target.value || undefined)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            disabled={disabled}
          >
            <option value="">Select area (optional)</option>
            {tertiaries.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
