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
  financialActions: FinancialActionItem[];
  financialCount: number;
  unreadMessages: UnreadMessageGroup[];
  unreadCount: number;
  totalCount: number;
}

type UpdatesCacheEntry = {
  summary: UpdatesSummary;
  updatedAt: number;
};

export const UPDATES_CACHE_TTL_MS = 15 * 60 * 1000;

const updatesCache = new Map<string, UpdatesCacheEntry>();

function buildCacheKey(token: string, actAsClientId?: string): string {
  const tokenTail = token.slice(-16);
  return `${actAsClientId || 'self'}::${tokenTail}`;
}

export function getUpdatesCacheEntry(token: string, actAsClientId?: string): UpdatesCacheEntry | null {
  return updatesCache.get(buildCacheKey(token, actAsClientId)) ?? null;
}

export function getFreshUpdatesSummary(
  token: string,
  actAsClientId?: string,
  maxAgeMs: number = UPDATES_CACHE_TTL_MS,
): UpdatesCacheEntry | null {
  const entry = getUpdatesCacheEntry(token, actAsClientId);
  if (!entry) return null;

  const ageMs = Date.now() - entry.updatedAt;
  return ageMs <= maxAgeMs ? entry : null;
}

export function setUpdatesSummaryCache(
  token: string,
  summary: UpdatesSummary,
  actAsClientId?: string,
): UpdatesCacheEntry {
  const entry: UpdatesCacheEntry = { summary, updatedAt: Date.now() };
  updatesCache.set(buildCacheKey(token, actAsClientId), entry);
  return entry;
}

export function clearUpdatesSummaryCache(token: string, actAsClientId?: string): void {
  updatesCache.delete(buildCacheKey(token, actAsClientId));
}

export function isUpdatesCacheStale(updatedAt: number, maxAgeMs: number = UPDATES_CACHE_TTL_MS): boolean {
  return Date.now() - updatedAt > maxAgeMs;
}
