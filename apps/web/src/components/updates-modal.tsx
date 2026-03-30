'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { StatusPill } from './status-pill';
import {
  type FinancialActionItem,
  type UnreadMessageGroup,
  type UpdatesSummary,
  getFreshUpdatesSummary,
  getUpdatesCacheEntry,
  isUpdatesCacheStale,
  setUpdatesSummaryCache,
} from '@/lib/updates-cache';

interface UpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  actAsClientId?: string; // when present, admin views a client's updates
  projectIdFilter?: string;
  initialData?: UpdatesSummary | null;
  lastUpdatedAt?: number | null;
  onDataUpdated?: (data: UpdatesSummary, updatedAt: number) => void;
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

export function UpdatesModal({
  isOpen,
  onClose,
  onRefresh,
  actAsClientId,
  projectIdFilter,
  initialData,
  lastUpdatedAt,
  onDataUpdated,
}: UpdatesModalProps) {
  const router = useRouter();
  const { accessToken: clientToken } = useAuth();
  const { accessToken: profToken } = useProfessionalAuth();
  const [data, setData] = useState<UpdatesSummary | null>(initialData ?? null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Use whichever token is available
  const token = clientToken || profToken;

  const fetchData = async (forceRefresh = false) => {
    if (!token) {
      setLoading(false);
      return;
    }

    if (!forceRefresh) {
      const fresh = getFreshUpdatesSummary(token, actAsClientId);
      if (fresh) {
        setData(fresh.summary);
        setLoading(false);
        onDataUpdated?.(fresh.summary, fresh.updatedAt);
        return;
      }

      const cached = getUpdatesCacheEntry(token, actAsClientId);
      if (cached) {
        setData(cached.summary);
        onDataUpdated?.(cached.summary, cached.updatedAt);
      }
    }

    if (forceRefresh) {
      setRefreshing(true);
    }

    try {
      const url = actAsClientId
        ? `${API_BASE_URL}/updates/summary?actAs=client&clientId=${encodeURIComponent(actAsClientId)}`
        : `${API_BASE_URL}/updates/summary`;
      const response = await fetchWithRetry(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const summary = await response.json();
        const entry = setUpdatesSummaryCache(token, summary, actAsClientId);
        setData(entry.summary);
        onDataUpdated?.(entry.summary, entry.updatedAt);
      }
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setData(initialData);
      }
      setLoading(!initialData);
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token, actAsClientId]);

  const handleMessageClick = (group: UnreadMessageGroup) => {
    // Navigate to the appropriate chat and mark as read
    if (group.chatType === 'private-foh') {
      // Check if this is an admin viewing support messages
      if (group.projectId === 'admin-support') {
        router.push('/admin/messaging?tab=support');
      } else {
        router.push('/support');
      }
    } else if (group.chatType === 'assist') {
      router.push(`/projects/${group.projectId}?tab=assist`);
    } else {
      router.push(`/projects/${group.projectId}?tab=chat`);
    }
    onClose();
  };

  const handleFinancialActionClick = (action: FinancialActionItem) => {
    // Navigate to the project
    router.push(`/projects/${action.projectId}`);
    onClose();
  };

  const handleMarkMessageAsRead = async (e: MouseEvent, group: UnreadMessageGroup) => {
    e.stopPropagation();
    if (!token || !group.threadId) {
      return;
    }

    setActionLoading(`msg-${group.threadId}`);
    try {
      const response = await fetch(`${API_BASE_URL}/updates/messages/mark-read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatType: group.chatType, threadId: group.threadId }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to mark message as read');
      }

      await fetchData(true);
      onRefresh();
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkAllRead = async () => {
    // This would require backend support for bulk marking
    // For now, just close and let individual clicks handle it
    onClose();
  };

  const filteredFinancialActions = projectIdFilter
    ? (data?.financialActions || []).filter((action) => action.projectId === projectIdFilter)
    : (data?.financialActions || []);

  const filteredUnreadMessages = projectIdFilter
    ? (data?.unreadMessages || []).filter((group) => group.projectId === projectIdFilter)
    : (data?.unreadMessages || []);

  const filteredFinancialCount = filteredFinancialActions.length;
  const filteredUnreadCount = filteredUnreadMessages.reduce((sum, group) => sum + (group.unreadCount || 0), 0);
  const hasFilteredUpdates = filteredFinancialActions.length > 0 || filteredUnreadMessages.length > 0;
  const filteredProjectName = projectIdFilter
    ? filteredFinancialActions[0]?.projectName ||
      filteredUnreadMessages[0]?.projectName ||
      `Project ${projectIdFilter.slice(0, 8)}`
    : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-300/70 ring-1 ring-white/40 bg-slate-900 text-white shadow-2xl shadow-slate-500/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
          <div>
              <h2 className="text-xl font-semibold text-white">
                Recent Activity
                {!projectIdFilter && filteredUnreadMessages.length > 0 && (
                  <span className="text-sm font-normal text-slate-400 ml-3">
                    {filteredUnreadCount} message{filteredUnreadCount === 1 ? '' : 's'} • {filteredUnreadMessages.length} conversation{filteredUnreadMessages.length === 1 ? '' : 's'}
                  </span>
                )}
              </h2>
            {lastUpdatedAt ? (
                <p className="text-xs text-slate-300">
                Updated {new Date(lastUpdatedAt).toLocaleTimeString()}
                {isUpdatesCacheStale(lastUpdatedAt) ? ' · stale' : ''}
              </p>
            ) : null}
              {projectIdFilter && filteredProjectName ? (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                  Filtered by project: {filteredProjectName}
                </div>
              ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Refresh updates"
              aria-label="Refresh updates"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 bg-white/10 text-slate-100 transition-colors hover:bg-white/20 disabled:opacity-50 ${
                refreshing ? 'animate-spin' : ''
              }`}
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="text-2xl leading-none text-slate-300 transition-colors hover:text-white"
            >
              ×
            </button>
          </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-900 p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-300">Loading...</div>
          ) : !hasFilteredUpdates ? (
            <div className="py-12 text-center text-slate-300">
              {projectIdFilter ? 'No updates for this project' : 'No updates at this time'}
            </div>
          ) : (
            <div className="space-y-8">
              {/* Financial Actions */}
              {filteredFinancialActions.length > 0 && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                    💰 Financial Actions
                    <span className="text-sm font-normal text-slate-300">
                      ({filteredFinancialCount})
                    </span>
                  </h3>
                  <div className="space-y-3">
                    {filteredFinancialActions.map((action) => (
                      <div
                        key={action.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-white">{action.projectName}</h4>
                              <StatusPill status={action.status} />
                            </div>
                            <p className="mb-1 text-sm text-slate-300">{action.description}</p>
                            <p className="text-lg font-semibold text-emerald-300">HK${action.amount}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {new Date(action.createdAt).toLocaleString()}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleFinancialActionClick(action)}
                              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unread Messages */}
              {filteredUnreadMessages.length > 0 && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                    💬 Unread Messages
                    <span className="text-sm font-normal text-slate-300">
                      ({filteredUnreadCount} total)
                    </span>
                  </h3>
                  <div className="space-y-3">
                    {filteredUnreadMessages.map((group, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-white">{group.projectName}</h4>
                              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                                {group.unreadCount}
                              </span>
                            </div>
                            {group.latestMessage.senderName && (
                              <p className="mb-1 text-xs font-semibold text-slate-200">
                                From: {group.latestMessage.senderName}
                              </p>
                            )}
                            <p className="line-clamp-2 text-sm text-slate-300">
                              {group.latestMessage.content}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {new Date(group.latestMessage.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => handleMarkMessageAsRead(e, group)}
                              disabled={actionLoading === `msg-${group.threadId}`}
                              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {actionLoading === `msg-${group.threadId}` ? 'Processing...' : 'OK'}
                            </button>
                            <button
                              onClick={() => handleMessageClick(group)}
                              className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-white"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {data && hasFilteredUpdates && (
          <div className="flex items-center justify-between border-t border-slate-700 bg-slate-800/80 px-6 py-4">
            <button
              onClick={handleMarkAllRead}
              className="text-sm font-medium text-slate-200 transition-colors hover:text-white"
            >
              Mark all messages as read
            </button>
            <button
              onClick={onClose}
              className="rounded-md bg-emerald-600 px-6 py-2 font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
