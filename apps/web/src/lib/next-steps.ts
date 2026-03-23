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

type NextStepFetchOptions = {
  cacheScope?: string;
  forceRefresh?: boolean;
  maxAgeMs?: number;
};

export const NEXT_STEP_CACHE_TTL_MS = 15 * 60 * 1000;

const nextStepCache = new Map<string, NextStepCacheEntry>();

function buildScope(token: string, cacheScope?: string): string {
  return cacheScope || token.slice(-16);
}

function cacheKey(projectId: string, scope: string): string {
  return `${scope}::${projectId}`;
}

export function invalidateNextStepCache(projectId: string, cacheScope?: string, token?: string): void {
  const scope = cacheScope || (token ? token.slice(-16) : '');
  if (!scope) return;
  nextStepCache.delete(cacheKey(projectId, scope));
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

  if (!options.forceRefresh) {
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
    nextStepCache.set(key, { action: null, updatedAt: Date.now() });
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    throw new NextStepAuthError();
  }

  if (!response.ok) {
    nextStepCache.set(key, { action: null, updatedAt: Date.now() });
    return null;
  }

  const data = (await response.json()) as NextStepResponse;
  const action = data.PRIMARY?.[0] ?? null;
  nextStepCache.set(key, { action, updatedAt: Date.now() });
  console.log('[NextStepCache] SET', { projectId, actionKey: action?.actionKey });
  return action;
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
