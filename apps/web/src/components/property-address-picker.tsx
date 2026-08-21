'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

export type PropertyAddressValue = {
  buildingName: string;
  buildingNameZh?: string | null;
  unitNumber: string;
  floorLevel: string;
  blockTower: string;
  districtAreaId: string;
  districtName: string;
  lat?: number | null;
  lng?: number | null;
  propertyId?: string;
};

type District = { id: string; code: string; name: string; nameZh: string | null };
type GazHit = {
  id: string;
  nameEn: string | null;
  nameZh: string | null;
  addressFull: string | null;
  districtAreaId: string | null;
  districtName: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Canonical address capture — district dropdown + residential building typeahead
 * (from the CSDI gazetteer) + unit/floor/block. Emits a PropertyAddressValue.
 */
export function PropertyAddressPicker({
  accessToken,
  value,
  onChange,
}: {
  accessToken: string;
  value: PropertyAddressValue;
  onChange: (v: PropertyAddressValue) => void;
}) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GazHit[]>([]);
  const [searching, setSearching] = useState(false);

  const patch = (p: Partial<PropertyAddressValue>) => onChange({ ...value, ...p });

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE_URL}/properties/districts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDistricts(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (value.districtAreaId) params.set('districtAreaId', value.districtAreaId);
        const res = await fetch(`${API_BASE_URL}/properties/gazetteer/search?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value.districtAreaId, accessToken]);

  const selectBuilding = (hit: GazHit) => {
    const districtName =
      hit.districtName ||
      districts.find((d) => d.id === hit.districtAreaId)?.name ||
      value.districtName;
    patch({
      buildingName: hit.nameEn || hit.addressFull || '',
      buildingNameZh: hit.nameZh ?? null,
      districtAreaId: hit.districtAreaId || value.districtAreaId,
      districtName,
      lat: hit.lat ?? null,
      lng: hit.lng ?? null,
    });
    setQuery(hit.nameEn || hit.addressFull || '');
    setSuggestions([]);
  };

  const preview = useMemo(() => {
    const parts: string[] = [];
    if (value.unitNumber.trim()) parts.push(`Flat ${value.unitNumber.trim()}`);
    if (value.floorLevel.trim()) parts.push(`${value.floorLevel.trim()}/F`);
    if (value.blockTower.trim()) parts.push(value.blockTower.trim());
    if (value.buildingName.trim()) parts.push(value.buildingName.trim());
    if (value.districtName.trim()) parts.push(value.districtName.trim());
    return parts.join(', ');
  }, [value]);

  return (
    <div className="space-y-2">
      <select
        value={value.districtAreaId}
        onChange={(e) => {
          const d = districts.find((x) => x.id === e.target.value);
          patch({ districtAreaId: e.target.value, districtName: d?.name || '' });
        }}
        className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
      >
        <option value="">Select district *</option>
        {districts.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.nameZh ? ` (${d.nameZh})` : ''}
          </option>
        ))}
      </select>

      <div className="relative">
        <input
          type="text"
          value={query || value.buildingName}
          onChange={(e) => {
            setQuery(e.target.value);
            patch({ buildingName: e.target.value, buildingNameZh: null, lat: null, lng: null });
          }}
          placeholder="Search residential building *"
          className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
        />
        {searching && <p className="mt-0.5 text-[10px] text-slate-400">Searching…</p>}
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#D4C8A0] bg-white shadow-lg">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectBuilding(s)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#F5EEDE]"
                >
                  <span className="font-medium text-slate-800">{s.nameEn || s.addressFull}</span>
                  {s.districtName ? <span className="ml-2 text-slate-400">· {s.districtName}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input
          value={value.unitNumber}
          onChange={(e) => patch({ unitNumber: e.target.value })}
          placeholder="Unit *"
          className="rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
        />
        <input
          value={value.floorLevel}
          onChange={(e) => patch({ floorLevel: e.target.value })}
          placeholder="Floor *"
          className="rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
        />
        <input
          value={value.blockTower}
          onChange={(e) => patch({ blockTower: e.target.value })}
          placeholder="Block/Tower"
          className="rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {preview && (
        <p className="text-[11px] text-slate-500">
          <span className="font-semibold">Preview:</span> {preview}
        </p>
      )}
    </div>
  );
}
