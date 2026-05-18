'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LocationSelect, { CanonicalLocation } from '@/components/location-select';
import { API_BASE_URL } from '@/config/api';

let cachedEmergencyTrades: string[] | null = null;
let cachedEmergencyTradesPromise: Promise<string[]> | null = null;

async function loadEmergencyTrades(): Promise<string[]> {
  if (cachedEmergencyTrades) return cachedEmergencyTrades;
  if (cachedEmergencyTradesPromise) return cachedEmergencyTradesPromise;

  cachedEmergencyTradesPromise = fetch(`${API_BASE_URL}/trades`)
    .then((r) => r.json())
    .then((data: Array<{ name?: string; title?: string; enabled?: boolean; sortOrder?: number }>) => {
      const names = (data || [])
        .filter((t) => t.enabled !== false)
        .sort((a, b) => {
          const diff = (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
          if (diff !== 0) return diff;
          return (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '');
        })
        .map((t) => t.name ?? t.title ?? '')
        .filter(Boolean);

      cachedEmergencyTrades = names;
      return names;
    })
    .finally(() => {
      cachedEmergencyTradesPromise = null;
    });

  return cachedEmergencyTradesPromise;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}
export function EmergencyModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [selectedTrade, setSelectedTrade] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<CanonicalLocation>({});
  const [description, setDescription] = useState('');
  const [trades, setTrades] = useState<string[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const isBusinessHours = useMemo(() => {
    const hours = new Date().getHours();
    return hours >= 7 && hours < 20;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (cachedEmergencyTrades) {
      setTrades(cachedEmergencyTrades);
      return;
    }

    setTradesLoading(true);
    loadEmergencyTrades()
      .then((names) => {
        setTrades(names);
      })
      .catch(() => {})
      .finally(() => setTradesLoading(false));
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) {
      setSelectedTrade('');
      setSelectedLocation({});
      setDescription('');
    }
  }, [isOpen]);
  const hasLocation = Boolean(selectedLocation.primary);
  const handleGetHelp = () => {
    if (!selectedTrade || !hasLocation) return;
    const locationParts = [selectedLocation.primary, selectedLocation.secondary, selectedLocation.tertiary]
      .filter(Boolean)
      .join(', ');
    const params = new URLSearchParams({
      source: 'emergency',
      trade: selectedTrade,
      location: locationParts,
      emergencyOnly: isBusinessHours ? 'false' : 'true',
    });
    if (description.trim()) params.set('notes', description.trim());
    router.push('/professionals?' + params.toString());
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
        <div className="mb-5 text-center">
          <p className="text-3xl mb-1">&#x1F6A8;</p>
          <h2 className="text-lg font-bold text-slate-900">Emergency help needed</h2>
          {!isBusinessHours && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              <span className="font-semibold">Off-hours mode</span> ? showing only emergency-available professionals
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Briefly describe the problem</label>
            <textarea
              rows={3}
              placeholder="e.g. Burst pipe under the kitchen sink, water everywhere..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#F97362]/40"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Trade needed</label>
            <select
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              disabled={tradesLoading}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-60"
            >
              <option value="">{tradesLoading ? 'Loading trades...' : 'Select a trade...'}</option>
              {trades.map((trade) => (
                <option key={trade} value={trade}>{trade}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Your location</label>
            <LocationSelect
              value={selectedLocation}
              onChange={setSelectedLocation}
              enableSearch
              labels={{ primary: 'Region', secondary: 'District', tertiary: 'Area' }}
              className="grid gap-2"
            />
          </div>
        </div>
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
            disabled={!selectedTrade || !hasLocation}
            className="flex-1 rounded-lg bg-[#F97362] px-4 py-2 text-sm font-semibold text-[#FCF8EE] hover:bg-[#e8624f] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Find help now
          </button>
        </div>
      </div>
    </div>
  );
}

