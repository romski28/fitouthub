import { API_BASE_URL } from '@/config/api';
import { recordCacheHit, recordCacheMiss, recordStaleRead, recordInvalidation } from './cache-metrics';

export type NextStepAction = {
  actionKey: string;
  actionLabel: string;
  description?: string;
  isPrimary: boolean;
  isElective: boolean;
  requiresAction: boolean;
};

type NextStepResponse = {
  PRIMARY?: NextStepAction[];
  ELECTIVE?: NextStepAction[];
};

type NextStepCacheEntry = {
  action: NextStepAction | null;
  updatedAt: number;
};

type NextStepListCacheEntry = {
  actions: NextStepAction[];
  updatedAt: number;
};

type NextStepFetchOptions = {
  cacheScope?: string;
  forceRefresh?: boolean;
  maxAgeMs?: number;
};

export const NEXT_STEP_CACHE_TTL_MS = 15 * 60 * 1000;
const NEXT_STEP_ENDPOINT_BACKOFF_MS = 2 * 60 * 1000;

const nextStepCache = new Map<string, NextStepCacheEntry>();
const nextStepInFlight = new Map<string, Promise<NextStepAction | null>>();
const nextStepListCache = new Map<string, NextStepListCacheEntry>();
const nextStepListInFlight = new Map<string, Promise<NextStepAction[]>>();
let nextStepEndpointBackoffUntil = 0;
let nextStepEndpointFailureCount = 0;

function applyEndpointBackoff() {
  nextStepEndpointFailureCount += 1;
  const multiplier = Math.min(nextStepEndpointFailureCount, 3);
  nextStepEndpointBackoffUntil = Date.now() + NEXT_STEP_ENDPOINT_BACKOFF_MS * multiplier;
}

function clearEndpointBackoff() {
  nextStepEndpointFailureCount = 0;
  nextStepEndpointBackoffUntil = 0;
}

function buildScope(token: string, cacheScope?: string): string {
  return cacheScope || token.slice(-16);
}

function cacheKey(projectId: string, scope: string): string {
  return `${scope}::${projectId}`;
}

export function invalidateNextStepCache(projectId: string, cacheScope?: string, token?: string): void {
  const scope = cacheScope || (token ? token.slice(-16) : '');
  if (scope) {
    const key = cacheKey(projectId, scope);
    nextStepCache.delete(key);
    nextStepListCache.delete(key);
    recordInvalidation('next-steps');
    return;
  }

  let invalidated = false;
  for (const key of Array.from(nextStepCache.keys())) {
    if (key.endsWith(`::${projectId}`)) {
      nextStepCache.delete(key);
      invalidated = true;
    }
  }

  for (const key of Array.from(nextStepListCache.keys())) {
    if (key.endsWith(`::${projectId}`)) {
      nextStepListCache.delete(key);
      invalidated = true;
    }
  }

  if (!invalidated) return;
  recordInvalidation('next-steps');
}

export class NextStepAuthError extends Error {
  constructor() {
    super('Unauthorized to fetch next steps');
    this.name = 'NextStepAuthError';
  }
}

export async function fetchPrimaryNextStep(
  projectId: string,
  token: string,
  options: NextStepFetchOptions = {},
): Promise<NextStepAction | null> {
  const scope = buildScope(token, options.cacheScope);
  const key = cacheKey(projectId, scope);
  const maxAgeMs = options.maxAgeMs ?? NEXT_STEP_CACHE_TTL_MS;

  if (!options.forceRefresh && Date.now() < nextStepEndpointBackoffUntil) {
    nextStepCache.set(key, { action: null, updatedAt: Date.now() });
    return null;
  }

  if (!options.forceRefresh) {
    const inFlight = nextStepInFlight.get(key);
    if (inFlight) return inFlight;

    const cached = nextStepCache.get(key);
    if (cached) {
      const ageMs = Date.now() - cached.updatedAt;
      if (ageMs <= maxAgeMs) {
        recordCacheHit('next-steps');
        return cached.action;
      }
      recordStaleRead('next-steps');
    } else {
      recordCacheMiss('next-steps');
    }
  }

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/projects/${projectId}/next-steps`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      // Network error (CORS failure, server down, etc.) — degrade silently
      applyEndpointBackoff();
      nextStepCache.set(key, { action: null, updatedAt: Date.now() });
      return null;
    }

    if (response.status === 401 || response.status === 403) {
      throw new NextStepAuthError();
    }

    if (!response.ok) {
      if (response.status === 404 || response.status >= 500) {
        applyEndpointBackoff();
      }
      nextStepCache.set(key, { action: null, updatedAt: Date.now() });
      return null;
    }

    const data = (await response.json()) as NextStepResponse;
    clearEndpointBackoff();
    const action = data.PRIMARY?.[0] ?? null;
    nextStepCache.set(key, { action, updatedAt: Date.now() });
    return action;
  })();

  nextStepInFlight.set(key, request);
  try {
    return await request;
  } finally {
    nextStepInFlight.delete(key);
  }
}

export async function fetchPrimaryNextSteps(
  projectId: string,
  token: string,
  options: NextStepFetchOptions = {},
): Promise<NextStepAction[]> {
  const scope = buildScope(token, options.cacheScope);
  const key = cacheKey(projectId, scope);
  const maxAgeMs = options.maxAgeMs ?? NEXT_STEP_CACHE_TTL_MS;

  if (!options.forceRefresh && Date.now() < nextStepEndpointBackoffUntil) {
    nextStepListCache.set(key, { actions: [], updatedAt: Date.now() });
    return [];
  }

  if (!options.forceRefresh) {
    const inFlight = nextStepListInFlight.get(key);
    if (inFlight) return inFlight;

    const cached = nextStepListCache.get(key);
    if (cached) {
      const ageMs = Date.now() - cached.updatedAt;
      if (ageMs <= maxAgeMs) {
        recordCacheHit('next-steps');
        return cached.actions;
      }
      recordStaleRead('next-steps');
    } else {
      recordCacheMiss('next-steps');
    }
  }

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/projects/${projectId}/next-steps`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      applyEndpointBackoff();
      nextStepListCache.set(key, { actions: [], updatedAt: Date.now() });
      return [];
    }

    if (response.status === 401 || response.status === 403) {
      throw new NextStepAuthError();
    }

    if (!response.ok) {
      if (response.status === 404 || response.status >= 500) {
        applyEndpointBackoff();
      }
      nextStepListCache.set(key, { actions: [], updatedAt: Date.now() });
      return [];
    }

    const data = (await response.json()) as NextStepResponse;
    clearEndpointBackoff();
    const actions = Array.isArray(data.PRIMARY) ? data.PRIMARY : [];
    nextStepListCache.set(key, { actions, updatedAt: Date.now() });
    return actions;
  })();

  nextStepListInFlight.set(key, request);
  try {
    return await request;
  } finally {
    nextStepListInFlight.delete(key);
  }
}

export async function completeNextStep(
  projectId: string,
  actionKey: string,
  token: string,
  cacheScope?: string,
): Promise<boolean> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/next-steps/${encodeURIComponent(actionKey)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userAction: 'COMPLETED' }),
    },
  );

  if (response.ok) {
    invalidateNextStepCache(projectId, cacheScope, token);
  }

  return response.ok;
}
