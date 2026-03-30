'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { colors, radii, shadows } from '@/styles/theme';
import { UpdatesModal } from './updates-modal';
import {
  type UpdatesSummary,
  getFreshUpdatesSummary,
  getUpdatesCacheEntry,
  isUpdatesCacheStale,
  setUpdatesSummaryCache,
} from '@/lib/updates-cache';

interface UpdatesButtonProps {
  className?: string;
  onSummaryChange?: (summary: UpdatesSummary | null) => void;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  maxAttempts = 3,
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(input, init);
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await sleep(300 * Math.pow(2, attempt - 1));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to fetch after retries');
};

const INSPIRATIONAL_MESSAGES = [
  "You're all caught up! Start something great today! 🚀",
  "Nothing pending! Time to make magic happen! ✨",
  "All clear! Ready to build something amazing? 💪",
  "You're on top of everything! Let's create! 🎨",
  "Inbox zero! Time to turn ideas into reality! 💡",
  "All done! Your next big project awaits! 🌟",
];

export function UpdatesButton({ className = '', onSummaryChange }: UpdatesButtonProps) {
  const { accessToken: clientToken, isLoggedIn } = useAuth();
  const { accessToken: profToken, isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<UpdatesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [projectIdFilter, setProjectIdFilter] = useState<string | undefined>(undefined);

  // Use whichever token is available
  const token = clientToken || profToken;

  // Pick a random inspirational message (stable per session)
  const inspirationalMessage = useMemo(() => {
    return INSPIRATIONAL_MESSAGES[Math.floor(Math.random() * INSPIRATIONAL_MESSAGES.length)];
  }, []);

  const fetchSummary = async (forceRefresh = false) => {
    if (!token) {
      console.log('No token available, skipping fetch');
      setLoading(false);
      onSummaryChange?.(null);
      return;
    }

    if (!forceRefresh) {
      const fresh = getFreshUpdatesSummary(token);
      if (fresh) {
        setSummary(fresh.summary);
        setLastUpdatedAt(fresh.updatedAt);
        onSummaryChange?.(fresh.summary);
        setLoading(false);
        return;
      }

      const cached = getUpdatesCacheEntry(token);
      if (cached) {
        setSummary(cached.summary);
        setLastUpdatedAt(cached.updatedAt);
        onSummaryChange?.(cached.summary);
      }
    }

    if (forceRefresh) {
      setRefreshing(true);
    }

    try {
      console.log('Fetching updates summary...');
      const response = await fetchWithRetry(`${API_BASE_URL}/updates/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Updates summary fetched:', data);
        const nextSummary: UpdatesSummary = {
          totalCount: data.totalCount,
          unreadCount: data.unreadCount,
          unreadMessages: Array.isArray(data.unreadMessages) ? data.unreadMessages : [],
        };
        setSummary(nextSummary);
        const entry = setUpdatesSummaryCache(token, nextSummary);
        setLastUpdatedAt(entry.updatedAt);
        onSummaryChange?.(nextSummary);
      } else {
        console.warn('Failed to fetch updates summary:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Hydration check
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      console.log('Waiting for token...');
      return;
    }

    console.log('Token available, fetching updates');
    fetchSummary();
  }, [token, hydrated]);

  useEffect(() => {
    if (!token || !lastUpdatedAt) return;

    const interval = setInterval(() => {
      if (isUpdatesCacheStale(lastUpdatedAt)) {
        void fetchSummary();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [token, lastUpdatedAt]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpenUpdates = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId?: string }>;
      setProjectIdFilter(customEvent.detail?.projectId || undefined);
      setIsOpen(true);
    };

    window.addEventListener('fitouthub:open-updates', handleOpenUpdates as EventListener);
    return () => {
      window.removeEventListener('fitouthub:open-updates', handleOpenUpdates as EventListener);
    };
  }, []);

  const handleOpen = () => {
    setProjectIdFilter(undefined);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleManualRefresh = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    await fetchSummary(true);
  };

  // Don't render until hydrated
  if (!hydrated) {
    return null;
  }

  // Don't render if not logged in
  if (!isLoggedIn && !profIsLoggedIn) {
    return null;
  }

  // Show loading state or inspirational message while fetching
  const hasUpdates = summary && summary.totalCount > 0;

  return (
    <>
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <button
          onClick={handleOpen}
          style={{
            backgroundColor: hasUpdates ? colors.primary : colors.successBg,
            color: hasUpdates ? colors.background : colors.success,
            borderColor: !hasUpdates ? colors.success : undefined,
          }}
          className={`relative inline-flex items-center gap-3 px-6 py-3 ${
            !hasUpdates ? 'border' : ''
          } font-medium ${radii.md} transition-opacity hover:opacity-90 ${shadows.subtle}`}
        >
          <span className="text-lg">{hasUpdates ? '🔔' : '✨'}</span>
          <span>
            {loading && !summary ? (
              'Loading...'
            ) : hasUpdates ? (
              <>
                {summary.totalCount} unread message{summary.totalCount === 1 ? '' : 's'}
              </>
            ) : (
              inspirationalMessage
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          title="Refresh messages"
          aria-label="Refresh messages"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${
            refreshing ? 'animate-spin' : ''
          }`}
        >
          ↻
        </button>
      </div>

      <UpdatesModal
        isOpen={isOpen}
        onClose={handleClose}
        onRefresh={() => fetchSummary(true)}
        projectIdFilter={projectIdFilter}
        initialData={summary}
        lastUpdatedAt={lastUpdatedAt}
        onDataUpdated={(nextSummary, updatedAt) => {
          setSummary(nextSummary);
          setLastUpdatedAt(updatedAt);
          onSummaryChange?.(nextSummary);
        }}
      />
    </>
  );
}
