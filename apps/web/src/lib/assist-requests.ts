import { API_BASE_URL } from '@/config/api';

export type AssistPresence = {
  hasAssist: boolean;
  status?: string;
};

type AssistFetchOptions = {
  cacheScope?: string;
  forceRefresh?: boolean;
  maxAgeMs?: number;
};

type AssistCacheEntry = {
  value: AssistPresence;
  updatedAt: number;
};

const ASSIST_CACHE_TTL_MS = 2 * 60 * 1000;
const ASSIST_ENDPOINT_BACKOFF_MS = 2 * 60 * 1000;

const assistCache = new Map<string, AssistCacheEntry>();
const assistInFlight = new Map<string, Promise<AssistPresence>>();

let assistEndpointBackoffUntil = 0;
let assistEndpointFailureCount = 0;

function buildScope(token: string, cacheScope?: string): string {
  return cacheScope || token.slice(-16);
}

function cacheKey(projectId: string, scope: string): string {
  return `${scope}::${projectId}`;
}

function applyEndpointBackoff() {
  assistEndpointFailureCount += 1;
  const multiplier = Math.min(assistEndpointFailureCount, 3);
  assistEndpointBackoffUntil = Date.now() + ASSIST_ENDPOINT_BACKOFF_MS * multiplier;
}

function clearEndpointBackoff() {
  assistEndpointFailureCount = 0;
  assistEndpointBackoffUntil = 0;
}

export async function fetchAssistPresenceByProject(
  projectId: string,
  token: string,
  options: AssistFetchOptions = {},
): Promise<AssistPresence> {
  const scope = buildScope(token, options.cacheScope);
  const key = cacheKey(projectId, scope);
  const maxAgeMs = options.maxAgeMs ?? ASSIST_CACHE_TTL_MS;

  if (!options.forceRefresh && Date.now() < assistEndpointBackoffUntil) {
    const fallback = { hasAssist: false };
    assistCache.set(key, { value: fallback, updatedAt: Date.now() });
    return fallback;
  }

  if (!options.forceRefresh) {
    const inFlight = assistInFlight.get(key);
    if (inFlight) return inFlight;

    const cached = assistCache.get(key);
    if (cached && Date.now() - cached.updatedAt <= maxAgeMs) {
      return cached.value;
    }
  }

  const request = (async () => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/assist-requests/by-project/${encodeURIComponent(projectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      applyEndpointBackoff();
      const fallback = { hasAssist: false };
      assistCache.set(key, { value: fallback, updatedAt: Date.now() });
      return fallback;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        applyEndpointBackoff();
      }
      const fallback = { hasAssist: false };
      assistCache.set(key, { value: fallback, updatedAt: Date.now() });
      return fallback;
    }

    clearEndpointBackoff();
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    const value: AssistPresence = {
      hasAssist: !!data?.assist?.id,
      status: data?.assist?.status || undefined,
    };
    assistCache.set(key, { value, updatedAt: Date.now() });
    return value;
  })();

  assistInFlight.set(key, request);
  try {
    return await request;
  } finally {
    assistInFlight.delete(key);
  }
}
