import type { Project } from './types';

type ProjectsCacheEntry = {
  projects: Project[];
  updatedAt: number;
};

const PROJECTS_CACHE_TTL_MS = 5 * 60 * 1000;
const PROJECTS_CACHE_STORAGE_PREFIX = 'fitouthub:projects-cache:';

const projectsCache = new Map<string, ProjectsCacheEntry>();

function buildCacheKey(token: string, clientId?: string): string {
  const tokenTail = token.slice(-16);
  return `${clientId || 'self'}::${tokenTail}`;
}

function getStorageKey(cacheKey: string): string {
  return `${PROJECTS_CACHE_STORAGE_PREFIX}${cacheKey}`;
}

function readEntryFromStorage(cacheKey: string): ProjectsCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectsCacheEntry;
    if (!parsed || typeof parsed.updatedAt !== 'number' || !Array.isArray(parsed.projects)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeEntryToStorage(cacheKey: string, entry: ProjectsCacheEntry): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getStorageKey(cacheKey), JSON.stringify(entry));
  } catch {
  }
}

export function getFreshProjectsCache(token: string, clientId?: string): ProjectsCacheEntry | null {
  const cacheKey = buildCacheKey(token, clientId);
  const inMemory = projectsCache.get(cacheKey);
  const entry = inMemory ?? readEntryFromStorage(cacheKey);

  if (!entry) return null;

  if (!inMemory) {
    projectsCache.set(cacheKey, entry);
  }

  if (Date.now() - entry.updatedAt <= PROJECTS_CACHE_TTL_MS) {
    return entry;
  }

  return null;
}

export function setProjectsCache(token: string, projects: Project[], clientId?: string): ProjectsCacheEntry {
  const cacheKey = buildCacheKey(token, clientId);
  const entry: ProjectsCacheEntry = {
    projects,
    updatedAt: Date.now(),
  };

  projectsCache.set(cacheKey, entry);
  writeEntryToStorage(cacheKey, entry);

  return entry;
}
