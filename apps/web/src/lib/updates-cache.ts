import { recordCacheHit, recordCacheMiss, recordStaleRead, recordInvalidation } from './cache-metrics';

export interface FinancialActionItem {
  id: string;
  type: string;
  description: string;
  amount: string;
  status: string;
  projectId: string;
  projectName: string;
  createdAt: string;
}

export interface UnreadMessageGroup {
  projectId: string;
  projectName: string;
  unreadCount: number;
  latestMessage: {
    content: string;
    createdAt: string;
    senderType: string;
    senderName?: string;
  };
  chatType: 'project-professional' | 'project-general' | 'assist' | 'private-foh';
  threadId?: string;
}

export interface UpdatesSummary {
  unreadMessages: UnreadMessageGroup[];
  unreadCount: number;
  totalCount: number;
}

type UpdatesCacheEntry = {
  summary: UpdatesSummary;
  updatedAt: number;
};

export const UPDATES_CACHE_TTL_MS = 15 * 60 * 1000;
const UPDATES_CACHE_STORAGE_PREFIX = 'fitouthub:updates-cache:';

const updatesCache = new Map<string, UpdatesCacheEntry>();

function buildCacheKey(token: string, actAsClientId?: string): string {
  const tokenTail = token.slice(-16);
  return `${actAsClientId || 'self'}::${tokenTail}`;
}

function getStorageKey(cacheKey: string): string {
  return `${UPDATES_CACHE_STORAGE_PREFIX}${cacheKey}`;
}

function readEntryFromStorage(cacheKey: string): UpdatesCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpdatesCacheEntry;
    if (!parsed || typeof parsed.updatedAt !== 'number' || !parsed.summary) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeEntryToStorage(cacheKey: string, entry: UpdatesCacheEntry): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getStorageKey(cacheKey), JSON.stringify(entry));
  } catch {
  }
}

function removeEntryFromStorage(cacheKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getStorageKey(cacheKey));
  } catch {
  }
}

export function getUpdatesCacheEntry(token: string, actAsClientId?: string): UpdatesCacheEntry | null {
  const cacheKey = buildCacheKey(token, actAsClientId);
  const inMemory = updatesCache.get(cacheKey);
  if (inMemory) return inMemory;

  const stored = readEntryFromStorage(cacheKey);
  if (stored) {
    updatesCache.set(cacheKey, stored);
    return stored;
  }

  return null;
}

export function getFreshUpdatesSummary(
  token: string,
  actAsClientId?: string,
  maxAgeMs: number = UPDATES_CACHE_TTL_MS,
): UpdatesCacheEntry | null {
  const entry = getUpdatesCacheEntry(token, actAsClientId);
  if (!entry) {
    recordCacheMiss('updates');
    return null;
  }

  const ageMs = Date.now() - entry.updatedAt;
  if (ageMs <= maxAgeMs) {
    recordCacheHit('updates');
    return entry;
  }
  recordStaleRead('updates');
  return null;
}

export function setUpdatesSummaryCache(
  token: string,
  summary: UpdatesSummary,
  actAsClientId?: string,
): UpdatesCacheEntry {
  const entry: UpdatesCacheEntry = { summary, updatedAt: Date.now() };
  const cacheKey = buildCacheKey(token, actAsClientId);
  updatesCache.set(cacheKey, entry);
  writeEntryToStorage(cacheKey, entry);
  return entry;
}

export function clearUpdatesSummaryCache(token: string, actAsClientId?: string): void {
  const cacheKey = buildCacheKey(token, actAsClientId);
  updatesCache.delete(cacheKey);
  removeEntryFromStorage(cacheKey);
  recordInvalidation('updates');
}

export function isUpdatesCacheStale(updatedAt: number, maxAgeMs: number = UPDATES_CACHE_TTL_MS): boolean {
  return Date.now() - updatedAt > maxAgeMs;
}
