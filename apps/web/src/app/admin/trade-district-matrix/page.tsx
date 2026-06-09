'use client';

import { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '@/config/api';

interface MatrixData {
  districts: string[];
  trades: string[];
  matrix: Record<string, Record<string, number>>;
  totalProfessionals: number;
}

export default function TradeDistrictMatrixPage() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);

  const fetchData = async (featured: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = featured
        ? `${API_BASE_URL}/admin/trade-district-matrix?featured=1`
        : `${API_BASE_URL}/admin/trade-district-matrix`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(featuredOnly);
  }, [featuredOnly]);

  const maxCount = useMemo(() => {
    if (!data) return 1;
    let max = 0;
    for (const d of data.districts) {
      for (const t of data.trades) {
        max = Math.max(max, data.matrix[d]?.[t] || 0);
      }
    }
    return max || 1;
  }, [data]);

  const getHeatColor = (count: number) => {
    if (count === 0) return 'bg-slate-50';
    const intensity = Math.round((count / maxCount) * 100);
    if (intensity <= 10) return 'bg-emerald-50';
    if (intensity <= 30) return 'bg-emerald-100';
    if (intensity <= 60) return 'bg-emerald-200';
    if (intensity <= 80) return 'bg-emerald-400';
    return 'bg-emerald-600';
  };

  const getTextColor = (count: number) => {
    if (count === 0) return 'text-slate-300';
    const intensity = Math.round((count / maxCount) * 100);
    return intensity > 60 ? 'text-white' : 'text-slate-700';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading matrix…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-rose-600">Error: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const filteredDistricts = selectedDistrict
    ? [selectedDistrict]
    : data.districts;
  const filteredTrades = selectedTrade
    ? [selectedTrade]
    : data.trades;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-full">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trade × District Matrix</h1>
            <p className="mt-1 text-sm text-slate-600">
              {data.totalProfessionals} professional{data.totalProfessionals !== 1 ? 's' : ''} ·
              {data.districts.length} districts · {data.trades.length} trades
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(e) => setFeaturedOnly(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            Approved only
          </label>
        </div>

        {/* Quick filter selects */}
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={selectedDistrict || ''}
            onChange={(e) => setSelectedDistrict(e.target.value || null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">All districts</option>
            {data.districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={selectedTrade || ''}
            onChange={(e) => setSelectedTrade(e.target.value || null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">All trades</option>
            {data.trades.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {(selectedDistrict || selectedTrade) && (
            <button
              onClick={() => { setSelectedDistrict(null); setSelectedTrade(null); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Matrix grid */}
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap border-r border-slate-200">
                  District ↓ / Trade →
                </th>
                {filteredTrades.map((trade) => (
                  <th
                    key={trade}
                    className="px-2 py-2 text-center font-medium text-slate-600 whitespace-nowrap cursor-pointer hover:bg-slate-200"
                    onClick={() => setSelectedTrade(selectedTrade === trade ? null : trade)}
                  >
                    {trade}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDistricts.map((district) => (
                <tr key={district} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td
                    className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-700 whitespace-nowrap border-r border-slate-200 cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedDistrict(selectedDistrict === district ? null : district)}
                  >
                    {district}
                  </td>
                  {filteredTrades.map((trade) => {
                    const count = data.matrix[district]?.[trade] || 0;
                    return (
                      <td
                        key={trade}
                        className={`px-2 py-2 text-center font-mono transition-colors ${getHeatColor(count)} ${getTextColor(count)}`}
                        title={`${district} × ${trade}: ${count} professional${count !== 1 ? 's' : ''}`}
                      >
                        {count || '·'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <span>0</span>
          <span className="inline-block h-3 w-6 rounded bg-slate-50 border border-slate-200" />
          <span className="inline-block h-3 w-6 rounded bg-emerald-50" />
          <span className="inline-block h-3 w-6 rounded bg-emerald-100" />
          <span className="inline-block h-3 w-6 rounded bg-emerald-200" />
          <span className="inline-block h-3 w-6 rounded bg-emerald-400" />
          <span className="inline-block h-3 w-6 rounded bg-emerald-600" />
          <span>{maxCount}+</span>
        </div>
      </div>
    </div>
  );
}
