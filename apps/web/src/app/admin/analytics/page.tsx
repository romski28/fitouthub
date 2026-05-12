'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type ProviderMetrics = {
  requests: number;
  success: number;
  failed: number;
  avgDurationMs: number;
  imagesAnalyzed?: number;
};

type AiMetricsResponse = {
  window: { days: number; since: string };
  providers: {
    deepseek: ProviderMetrics;
    qwen: ProviderMetrics;
  };
  daily: Array<{ day: string; deepseek: number; qwen: number }>;
};

export default function AnalyticsPage() {
  const { accessToken, user, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AiMetricsResponse | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!accessToken || user?.role !== 'admin') {
      setError('Admin access required');
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/ai/admin/metrics`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || `Failed to load AI metrics (${res.status})`);
        }
        setMetrics(payload as AiMetricsResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load AI metrics');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [accessToken, user?.role, isLoading]);

  const maxDaily = useMemo(() => {
    if (!metrics?.daily?.length) return 1;
    return Math.max(...metrics.daily.map((entry) => Math.max(entry.deepseek, entry.qwen, 1)));
  }, [metrics]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">AI Observability Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Live provider metrics for DeepSeek text orchestration and Qwen multimodal analysis.
        </p>
      </div>

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
          Loading AI metrics...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && metrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">DeepSeek requests (7d)</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.providers.deepseek.requests}</p>
              <p className="mt-1 text-xs text-slate-600">avg {metrics.providers.deepseek.avgDurationMs} ms</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Qwen vision requests (7d)</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.providers.qwen.requests}</p>
              <p className="mt-1 text-xs text-slate-600">avg {metrics.providers.qwen.avgDurationMs} ms</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Qwen images analyzed</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.providers.qwen.imagesAnalyzed ?? 0}</p>
              <p className="mt-1 text-xs text-slate-600">last {metrics.window.days} days</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Qwen failures</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.providers.qwen.failed}</p>
              <p className="mt-1 text-xs text-slate-600">monitor fallback risk</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Daily request trend</h2>
                <p className="text-sm text-slate-600">DeepSeek vs Qwen successful requests by day.</p>
              </div>
              <span className="text-xs text-slate-500">Last {metrics.window.days} days</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-7">
              {metrics.daily.map((entry) => (
                <div key={entry.day} className="flex flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end gap-2 rounded bg-slate-50 p-2">
                    <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(entry.deepseek / maxDaily) * 100}%` }} />
                    <div className="w-1/2 rounded-t bg-orange-500" style={{ height: `${(entry.qwen / maxDaily) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500">{entry.day.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="h-2 w-4 rounded bg-emerald-500" /> DeepSeek
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-4 rounded bg-orange-500" /> Qwen
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
