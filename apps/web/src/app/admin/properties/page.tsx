'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type District = {
  id: string;
  code: string;
  name: string;
  nameZh: string | null;
  zoneId: string;
};

type GazetteerHit = {
  id: string;
  nameEn: string | null;
  nameZh: string | null;
  addressFull: string | null;
  districtAreaId: string | null;
  districtName: string | null;
  buildingType: string | null;
  lat: number | null;
  lng: number | null;
  similarity: number;
};

type MatchCandidate = {
  id: string;
  sourcePropertyId: string;
  candidatePropertyId: string;
  similarity: number;
  status: string;
  sourceProperty: { buildingName: string; displayAddress: string | null };
  candidateProperty: { buildingName: string; displayAddress: string | null };
};

export default function AdminPropertiesPage() {
  const { accessToken, user, isLoggedIn } = useAuth();

  const [districts, setDistricts] = useState<District[]>([]);
  const [buildingQuery, setBuildingQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GazetteerHit[]>([]);
  const [selected, setSelected] = useState<GazetteerHit | null>(null);
  const [districtAreaId, setDistrictAreaId] = useState('');
  const [unit, setUnit] = useState('');
  const [floor, setFloor] = useState('');
  const [block, setBlock] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const loadDistricts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/properties/districts`, { headers: authHeaders });
      if (!res.ok) throw new Error(`districts ${res.status}`);
      const data = await res.json();
      setDistricts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/admin/matches?status=pending`, { headers: authHeaders });
      if (!res.ok) throw new Error(`matches ${res.status}`);
      const data = await res.json();
      setMatches(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMatchesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (isLoggedIn === undefined) return;
    if (!accessToken || user?.role !== 'admin') return;
    loadDistricts();
    loadMatches();
  }, [isLoggedIn, accessToken, user, loadDistricts, loadMatches]);

  // Debounced gazetteer typeahead
  useEffect(() => {
    if (!accessToken || user?.role !== 'admin') return;
    if (buildingQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: buildingQuery });
        if (districtAreaId) params.set('districtAreaId', districtAreaId);
        const res = await fetch(`${API_BASE_URL}/properties/gazetteer/search?${params}`, { headers: authHeaders });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingQuery, districtAreaId, accessToken]);

  const selectBuilding = (hit: GazetteerHit) => {
    setSelected(hit);
    setBuildingQuery(hit.nameEn || hit.addressFull || '');
    if (hit.districtAreaId) setDistrictAreaId(hit.districtAreaId);
    setSuggestions([]);
  };

  const displayAddress = useMemo(() => {
    const parts: string[] = [];
    if (unit.trim()) parts.push(`Flat ${unit.trim()}`);
    if (floor.trim()) parts.push(`${floor.trim()}/F`);
    if (block.trim()) parts.push(block.trim());
    parts.push(buildingQuery.trim() || '(building)');
    const d = districts.find((x) => x.id === districtAreaId);
    if (d) parts.push(d.name);
    return parts.filter(Boolean).join(', ');
  }, [unit, floor, block, buildingQuery, districtAreaId, districts]);

  const submit = async () => {
    if (!buildingQuery.trim()) {
      setError('Enter a building name');
      return;
    }
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/properties`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingName: buildingQuery.trim(),
          unitNumber: unit.trim() || undefined,
          floorLevel: floor.trim() || undefined,
          blockTower: block.trim() || undefined,
          districtAreaId: districtAreaId || undefined,
          lat: selected?.lat ?? undefined,
          lng: selected?.lng ?? undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || `save ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      loadMatches();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resolve = async (id: string, action: 'merge' | 'dismiss') => {
    setResolvingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/admin/matches/${id}/resolve`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`resolve ${res.status}`);
      loadMatches();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoggedIn === undefined || !user) {
    return <div className="min-h-screen" />;
  }

  if (user.role !== 'admin') {
    return <div className="p-6 text-slate-700">Admin access required</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Properties</h1>
        <p className="mt-1 text-sm text-slate-600">
          Capture a residential unit and review near-duplicate candidates.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Capture form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Capture property</h2>

          <label className="mt-4 block text-xs font-medium text-slate-600">District</label>
          <select
            value={districtAreaId}
            onChange={(e) => setDistrictAreaId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Any / unknown</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.nameZh ? ` (${d.nameZh})` : ''}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-xs font-medium text-slate-600">Building</label>
          <div className="relative">
            <input
              value={buildingQuery}
              onChange={(e) => {
                setBuildingQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Search residential building…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {searching && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectBuilding(s)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{s.nameEn || s.addressFull}</span>
                      {s.nameZh ? <span className="ml-2 text-xs text-slate-500">{s.nameZh}</span> : null}
                      {s.districtName ? <span className="ml-2 text-xs text-slate-400">· {s.districtName}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Unit</label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="A"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Floor</label>
              <input
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="12"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Block / Tower</label>
              <input
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                placeholder="Tower 3"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="mt-4 rounded-lg border border-[#D4C8A0] bg-[#F5EEDE] px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold">Preview:</span> {displayAddress}
          </p>

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save property'}
          </button>

          {result && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-800">
                {result.matched === 'exact' ? 'Matched existing property' : 'Created new property'}
              </p>
              <p className="mt-1 text-slate-600">
                canonicalKey: <code className="text-[10px]">{result.property?.canonicalKey}</code>
              </p>
              {Array.isArray(result.matchCandidates) && result.matchCandidates.length > 0 && (
                <p className="mt-1 text-amber-700">
                  ⚠ {result.matchCandidates.length} duplicate candidate(s) flagged for review
                </p>
              )}
            </div>
          )}
        </div>

        {/* Match queue */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Duplicate review queue</h2>
          {matchesLoading && <p className="mt-2 text-xs text-slate-400">Loading…</p>}
          {!matchesLoading && matches.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">No pending duplicate candidates.</p>
          )}
          <ul className="mt-2 space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs">
                    <p className="font-medium text-slate-800">{m.sourceProperty.buildingName}</p>
                    <p className="text-slate-500">vs {m.candidateProperty.buildingName}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      similarity {(m.similarity * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={resolvingId === m.id}
                      onClick={() => resolve(m.id, 'merge')}
                      className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Merge
                    </button>
                    <button
                      type="button"
                      disabled={resolvingId === m.id}
                      onClick={() => resolve(m.id, 'dismiss')}
                      className="rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
