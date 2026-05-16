'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CanonicalLocation } from '@/components/location-select';
import { searchLocations } from '@/lib/location-search';
import { matchLocation } from '@/lib/location-matcher';
import { Professional } from '@/lib/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  availableTrades: string[];
}

export function EmergencyModal({ isOpen, onClose, availableTrades }: Props) {
  const router = useRouter();
  const t = useTranslations('emergency');
  const [selectedTrade, setSelectedTrade] = useState<string>('');
  const [locationSearch, setLocationSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<CanonicalLocation | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ primary?: string; secondary?: string; tertiary?: string; display: string }>>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // Determine if we're in business hours (07:00 - 20:00)
  const isBusinessHours = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();
    return hours >= 7 && hours < 20;
  }, []);

  const handleLocationSearch = (value: string) => {
    setLocationSearch(value);
    if (!value.trim()) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    const results = searchLocations(value, 6);
    setLocationSuggestions(results);
    setShowLocationSuggestions(results.length > 0);
  };

  const handleLocationSelect = (result: { primary?: string; secondary?: string; tertiary?: string; display: string }) => {
    setSelectedLocation(result as CanonicalLocation);
    setLocationSearch(result.display);
    setShowLocationSuggestions(false);
  };

  const handleGetHelp = () => {
    if (!selectedTrade || !selectedLocation) return;

    // Build query params
    const params = new URLSearchParams({
      source: 'emergency',
      trade: selectedTrade,
      location: [selectedLocation.primary, selectedLocation.secondary, selectedLocation.tertiary].filter(Boolean).join(', '),
      emergencyOnly: isBusinessHours ? 'false' : 'true', // Off-hours only show emergency-certified
    });

    router.push(`/professionals?${params.toString()}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-white/45 bg-[#F5EEDE]/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 text-center">
          <p className="text-3xl mb-2">🚨</p>
          <h2 className="text-lg font-bold text-slate-900">It's an emergency and I need a...</h2>
        </div>

        <div className="space-y-4">
          {/* Trade selector */}
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Trade</label>
            <select
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Select a trade...</option>
              {availableTrades.map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
          </div>

          {/* Location selector */}
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Location</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Enter your location..."
                value={locationSearch}
                onChange={(e) => handleLocationSearch(e.target.value)}
                onFocus={() => {
                  if (locationSearch) setShowLocationSuggestions(locationSuggestions.length > 0);
                }}
                onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 100)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                  {locationSuggestions.map((result, idx) => (
                    <button
                      key={`${idx}-${result.primary}-${result.secondary}-${result.tertiary}`}
                      type="button"
                      className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleLocationSelect(result)}
                    >
                      {result.display}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Business hours info */}
          {!isBusinessHours && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">Off-hours mode</p>
              <p>Showing professionals available for emergency calls.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGetHelp}
            disabled={!selectedTrade || !selectedLocation}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Get help!
          </button>
        </div>
      </div>
    </div>
  );
}
