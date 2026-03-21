/**
 * Lightweight cache metrics tracker for performance monitoring
 * Emit to console (dev) or external service (prod) as needed
 */

declare global {
  interface Window {
    __DEBUG_CACHE_METRICS?: boolean;
  }
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  staleReads: number;
  invalidations: number;
}

const metrics = new Map<string, CacheMetrics>();

const DEFAULT_METRICS: CacheMetrics = {
  hits: 0,
  misses: 0,
  staleReads: 0,
  invalidations: 0,
};

function getMetrics(name: string): CacheMetrics {
  if (!metrics.has(name)) {
    metrics.set(name, { ...DEFAULT_METRICS });
  }
  return metrics.get(name)!;
}

export function recordCacheHit(name: string): void {
  const m = getMetrics(name);
  m.hits++;
  maybePrint(name, `HIT (${m.hits}/${m.hits + m.misses})`);
}

export function recordCacheMiss(name: string): void {
  const m = getMetrics(name);
  m.misses++;
  maybePrint(name, `MISS (${m.hits}/${m.hits + m.misses})`);
}

export function recordStaleRead(name: string): void {
  const m = getMetrics(name);
  m.staleReads++;
  maybePrint(name, `STALE-READ (${m.staleReads})`);
}

export function recordInvalidation(name: string): void {
  const m = getMetrics(name);
  m.invalidations++;
  maybePrint(name, `INVALIDATION (${m.invalidations})`);
}

function maybePrint(name: string, event: string): void {
  if (typeof window === 'undefined') return;
  const debug = window.__DEBUG_CACHE_METRICS === true;
  if (debug) {
    const m = getMetrics(name);
    const hitRate = m.hits + m.misses > 0 ? ((m.hits / (m.hits + m.misses)) * 100).toFixed(1) : 'N/A';
    console.log(`[CACHE:${name}] ${event} [HR: ${hitRate}%]`);
  }
}

export function getMetricsSnapshot(): Record<string, CacheMetrics> {
  const snapshot: Record<string, CacheMetrics> = {};
  metrics.forEach((m, name) => {
    snapshot[name] = { ...m };
  });
  return snapshot;
}

export function enableDebugLogging(): void {
  if (typeof window !== 'undefined') {
    window.__DEBUG_CACHE_METRICS = true;
    console.log('[CACHE] Debug logging enabled. Run getMetricsSnapshot() to view stats.');
  }
}

export function disableDebugLogging(): void {
  if (typeof window !== 'undefined') {
    window.__DEBUG_CACHE_METRICS = false;
  }
}
