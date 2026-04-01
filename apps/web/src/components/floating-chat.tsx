'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import ChatImageAttachment from './chat-image-attachment';
import ChatImageUploader from './chat-image-uploader';

interface ChatMessage {
  id: string;
  senderType: 'user' | 'foh' | 'client' | 'professional' | 'anonymous';
  content: string;
  attachments?: { url: string; filename: string }[];
  context?: {
    pageType: 'project_creation' | 'project_view' | 'general';
    pathname: string;
    projectId?: string | null;
    projectName?: string | null;
  };
  createdAt: string;
}

interface PrivateThreadResponse {
  threadId?: string;
  id?: string;
  projectId?: string | null;
  status?: 'open' | 'in_progress' | 'closure_pending' | 'closed' | string;
  closureDueAt?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  messages?: ChatMessage[];
  unreadCount?: number;
  totalMessages?: number;
  hasMoreMessages?: boolean;
}

const CHAT_PAGE_SIZE = 30;
const PROJECT_NAME_CACHE_PREFIX = 'foh_project_name_';

const resolveProjectIdFromPath = (path: string | null | undefined) => {
  if (!path) return null;
  const match = path.match(/^\/(?:projects|professional-projects)\/([^/?#]+)/i);
  return match?.[1] ?? null;
};

const getProjectNameCacheKey = (projectId: string) => `${PROJECT_NAME_CACHE_PREFIX}${projectId}`;

const readCachedProjectName = (projectId?: string | null) => {
  if (!projectId || typeof window === 'undefined') return null;
  const value = localStorage.getItem(getProjectNameCacheKey(projectId));
  return value?.trim() ? value.trim() : null;
};

const storeCachedProjectName = (projectId?: string | null, projectName?: string | null) => {
  if (!projectId || typeof window === 'undefined') return;
  const key = getProjectNameCacheKey(projectId);
  const normalized = projectName?.trim() || null;
  if (!normalized) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, normalized);
};

type ChatContext = {
  pageType: 'project_creation' | 'project_view' | 'general';
  pathname: string;
  projectId?: string | null;
  projectName?: string | null;
};

const getChatContextFromPath = (path: string | null | undefined): ChatContext => {
  const pathname = path || '/';
  if (pathname.startsWith('/create-project')) {
    return {
      pageType: 'project_creation' as const,
      pathname,
      projectId: null,
      projectName: null,
    };
  }

  const projectId = resolveProjectIdFromPath(pathname);
  if (projectId) {
    return {
      pageType: 'project_view' as const,
      pathname,
      projectId,
      projectName: null,
    };
  }

  return {
    pageType: 'general' as const,
    pathname,
    projectId: null,
    projectName: null,
  };
};

const getContextKey = (context: ChatContext) => {
  if (context.pageType === 'project_view' && context.projectId) {
    return `project:${context.projectId}`;
  }
  if (context.pageType === 'project_creation') {
    return 'create-project';
  }
  return 'general';
};

const getContextLabel = (context: ChatContext) => {
  if (context.pageType === 'project_view') {
    return context.projectName?.trim() ? `Project support · ${context.projectName.trim()}` : 'Project support';
  }
  if (context.pageType === 'project_creation') {
    return context.projectName?.trim() ? `Project setup · ${context.projectName.trim()}` : 'Project setup support';
  }
  return 'General support';
};


export default function FloatingChat() {
  const pathname = usePathname();
  const { isLoggedIn: clientLoggedIn, accessToken: clientToken } = useAuth();
  const { isLoggedIn: proLoggedIn, accessToken: proToken } = useProfessionalAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; filename: string }[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [threadStatus, setThreadStatus] = useState<'open' | 'in_progress' | 'closure_pending' | 'closed' | string>('open');
  const [threadClosureDueAt, setThreadClosureDueAt] = useState<string | null>(null);
  const [threadResolvedAt, setThreadResolvedAt] = useState<string | null>(null);
  const [threadResolutionReason, setThreadResolutionReason] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [contextOverride, setContextOverride] = useState<ChatContext | null>(null);
  const [projectNameHint, setProjectNameHint] = useState<string | null>(null);

  const isAdminPage = pathname?.startsWith('/admin');
  const isLoggedIn = clientLoggedIn || proLoggedIn;
  const accessToken = clientToken || proToken;
  const userRole = clientLoggedIn ? 'client' : proLoggedIn ? 'professional' : 'anonymous';
  const pathContext = useMemo(() => {
    const base = getChatContextFromPath(pathname);
    if (base.pageType === 'project_view') {
      return {
        ...base,
        projectName: projectNameHint ?? base.projectName ?? null,
      };
    }
    return base;
  }, [pathname, projectNameHint]);
  const chatContext = useMemo(() => {
    const activeContext = contextOverride ?? pathContext;
    if (
      activeContext.pageType === 'project_view' &&
      !activeContext.projectName &&
      pathContext.pageType === 'project_view' &&
      activeContext.projectId === pathContext.projectId &&
      pathContext.projectName
    ) {
      return {
        ...activeContext,
        projectName: pathContext.projectName,
      };
    }
    return activeContext;
  }, [contextOverride, pathContext]);
  const contextLabel = getContextLabel(chatContext);

  const getStoredThreadKey = (context: ChatContext) => `foh_thread_${userRole}_${getContextKey(context)}`;

  const readStoredThreadId = (context: ChatContext) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(getStoredThreadKey(context));
  };

  const storeThreadId = (context: ChatContext, id: string | null | undefined) => {
    if (typeof window === 'undefined') return;
    const key = getStoredThreadKey(context);
    if (!id) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, id);
  };

  // Close chat and clear state on logout
  useEffect(() => {
    if (!isLoggedIn) {
      // User logged out
      setIsOpen(false);
      setThreadId(null);
      setMessages([]);
      setMessage('');
      setUnreadCount(0);
      setThreadStatus('open');
      setThreadClosureDueAt(null);
      setThreadResolvedAt(null);
      setThreadResolutionReason(null);
      setHasOlderMessages(false);
      setContextOverride(null);
      console.log('[FloatingChat] User logged out, clearing chat state');
    }
  }, [isLoggedIn]);

  useEffect(() => {
    setContextOverride(null);
  }, [pathname]);

  useEffect(() => {
    setProjectNameHint(readCachedProjectName(resolveProjectIdFromPath(pathname)));
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId?: string; projectName?: string }>;
      const projectId = customEvent.detail?.projectId;
      const projectName = customEvent.detail?.projectName?.trim() || null;
      if (!projectId) return;
      storeCachedProjectName(projectId, projectName);
      if (projectId === resolveProjectIdFromPath(pathname)) {
        setProjectNameHint(projectName);
      }
    };

    window.addEventListener('foh-project-meta', handler as EventListener);
    return () => window.removeEventListener('foh-project-meta', handler as EventListener);
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ context?: 'project_creation' | 'project_view' | 'general'; projectId?: string; projectName?: string; initialMessage?: string; }>;
      const detail = customEvent.detail || {};

      const requestedProjectId = detail.projectId || resolveProjectIdFromPath(pathname);
      const nextContext: ChatContext = detail.context === 'project_view' && requestedProjectId
        ? {
            pageType: 'project_view',
            pathname: pathname || '/',
            projectId: requestedProjectId,
            projectName: detail.projectName?.trim() || null,
          }
        : detail.context === 'project_creation'
          ? { pageType: 'project_creation', pathname: '/create-project', projectId: null, projectName: detail.projectName?.trim() || null }
          : getChatContextFromPath(pathname);

      setContextOverride(nextContext);
      if (detail.initialMessage?.trim()) {
        setMessage(detail.initialMessage.trim());
      }
      setIsOpen(true);
    };

    window.addEventListener('foh-open-chat', handler as EventListener);
    return () => window.removeEventListener('foh-open-chat', handler as EventListener);
  }, [pathname]);

  // Reset active thread when context/user changes so each context loads its own thread
  useEffect(() => {
    if (!isOpen) return;
    setThreadId(null);
    setMessages([]);
    setUnreadCount(0);
    setHasOlderMessages(false);
  }, [isOpen, userRole, chatContext.pageType, chatContext.projectId]);

  // Load or create thread
  useEffect(() => {
    const applyThreadState = (data: PrivateThreadResponse | null | undefined) => {
      setThreadStatus(data?.status || 'open');
      setThreadClosureDueAt(data?.closureDueAt || null);
      setThreadResolvedAt(data?.resolvedAt || null);
      setThreadResolutionReason(data?.resolutionReason || null);
      setHasOlderMessages(Boolean(data?.hasMoreMessages));
    };

    const projectIdParam = chatContext.projectId ? `&projectId=${encodeURIComponent(chatContext.projectId)}` : '';

    const getThreadUrl = (currentThreadId: string, offset = 0, limit = CHAT_PAGE_SIZE) => {
      if (isLoggedIn && accessToken) {
        if (currentThreadId) {
          return `${API_BASE_URL}/chat/private/${currentThreadId}?includeArchived=1&messageLimit=${limit}&messageOffset=${offset}${projectIdParam}`;
        }
        return `${API_BASE_URL}/chat/private?includeArchived=1&messageLimit=${limit}&messageOffset=${offset}${projectIdParam}`;
      }

      return `${API_BASE_URL}/chat/anonymous/${currentThreadId}?includeArchived=1&messageLimit=${limit}&messageOffset=${offset}`;
    };

    const loadThread = async () => {
      setLoading(true);
      try {
        if (isLoggedIn && accessToken) {
          console.log('[FloatingChat] Loading logged-in user thread...');
          const storedThreadId = readStoredThreadId(chatContext);

          if (storedThreadId?.startsWith('stub-')) {
            storeThreadId(chatContext, null);
          }

          if (storedThreadId && !storedThreadId.startsWith('stub-')) {
            try {
              const res = await fetch(getThreadUrl(storedThreadId, 0, CHAT_PAGE_SIZE), {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              });
              if (res.ok) {
                const data = (await res.json()) as PrivateThreadResponse;
                const realThreadId = data.threadId || data.id || storedThreadId;
                const expectedProjectId = chatContext.pageType === 'project_view' ? chatContext.projectId ?? null : null;
                const actualProjectId = data.projectId ?? null;
                if (actualProjectId !== expectedProjectId) {
                  console.warn('[FloatingChat] Stored thread context mismatch, resetting cached thread', {
                    storedThreadId,
                    expectedProjectId,
                    actualProjectId,
                  });
                  storeThreadId(chatContext, null);
                } else {
                  setThreadId(realThreadId);
                  setMessages(data.messages || []);
                  setUnreadCount(data.unreadCount || 0);
                  applyThreadState(data);
                  storeThreadId(chatContext, realThreadId);
                }
                if (actualProjectId === expectedProjectId) {
                  return;
                }
              }
              if (res.status === 404) {
                storeThreadId(chatContext, null);
              }
            } catch (e) {
              console.warn('[FloatingChat] Stored private thread fetch failed:', e);
            }
          }

          try {
            const createRes = await fetch(`${API_BASE_URL}/chat/private`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ projectId: chatContext.projectId ?? null }),
            });
            if (createRes.ok) {
              const data = await createRes.json();
              const realThreadId = data.threadId || data.id;
              const expectedProjectId = chatContext.pageType === 'project_view' ? chatContext.projectId ?? null : null;
              const actualProjectId = data.projectId ?? null;
              if (actualProjectId !== expectedProjectId) {
                console.warn('[FloatingChat] Created thread context mismatch, refusing thread for current context', {
                  realThreadId,
                  expectedProjectId,
                  actualProjectId,
                });
                storeThreadId(chatContext, null);
              } else {
                if (realThreadId) {
                  setThreadId(realThreadId);
                  storeThreadId(chatContext, realThreadId);
                }
                setMessages(data.messages || []);
                setUnreadCount(data.unreadCount || 0);
                applyThreadState(data);
                return;
              }
            }
          } catch (e) {
            console.warn('[FloatingChat] Private chat create error:', e);
          }

          const stubId = `stub-${userRole}-${Date.now()}`;
          setThreadId(stubId);
          setMessages([]);
          applyThreadState(null);
          storeThreadId(chatContext, stubId);
        } else {
          console.log('[FloatingChat] Loading anonymous user thread...');
          let anonId = readStoredThreadId(chatContext);

          if (anonId) {
            try {
              const res = await fetch(getThreadUrl(anonId, 0, CHAT_PAGE_SIZE));
              if (res.ok) {
                const data = await res.json();
                const realThreadId = data.threadId || data.id || anonId;
                setThreadId(realThreadId);
                setMessages(data.messages || []);
                applyThreadState(data);
                storeThreadId(chatContext, realThreadId);
                return;
              }
              if (res.status === 404) {
                storeThreadId(chatContext, null);
                anonId = null;
              }
            } catch (e) {
              console.warn('[FloatingChat] Could not fetch anon messages:', e);
            }
          }

          if (!anonId) {
            try {
              const res = await fetch(`${API_BASE_URL}/chat/anonymous`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
              if (res.ok) {
                const data = await res.json();
                anonId = data.threadId || data.id;
                if (anonId) {
                  setThreadId(anonId);
                  setMessages(data.messages || []);
                  applyThreadState(data);
                  storeThreadId(chatContext, anonId);
                  return;
                }
              }
            } catch (e) {
              console.warn('[FloatingChat] Anonymous chat endpoint error:', e);
            }
          }

          const stubId = `stub-anon-${Date.now()}`;
          setThreadId(stubId);
          setMessages([]);
          applyThreadState(null);
          storeThreadId(chatContext, stubId);
        }
      } finally {
        console.log('[FloatingChat] Finished loading thread');
        setLoading(false);
      }
    };

    if (isOpen && !threadId) {
      console.log('[FloatingChat] Opening chat, loading thread...');
      loadThread();
    }
  }, [isOpen, isLoggedIn, accessToken, userRole, chatContext, threadId]);

  const loadOlderMessages = async () => {
    if (!threadId || threadId.startsWith('stub-') || loadingOlderMessages || !hasOlderMessages) return;

    setLoadingOlderMessages(true);
    try {
      const offset = messages.length;
      const projectIdParam = chatContext.projectId ? `&projectId=${encodeURIComponent(chatContext.projectId)}` : '';
      const url = isLoggedIn && accessToken
        ? `${API_BASE_URL}/chat/private/${threadId}?includeArchived=1&messageLimit=${CHAT_PAGE_SIZE}&messageOffset=${offset}${projectIdParam}`
        : `${API_BASE_URL}/chat/anonymous/${threadId}?includeArchived=1&messageLimit=${CHAT_PAGE_SIZE}&messageOffset=${offset}`;
      const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to load older messages');
      const data = (await res.json()) as PrivateThreadResponse;
      setMessages((prev) => {
        const incoming = data.messages || [];
        const deduped = incoming.filter((msg) => !prev.some((existing) => existing.id === msg.id));
        return [...deduped, ...prev];
      });
      setHasOlderMessages(Boolean(data.hasMoreMessages));
      setThreadStatus(data.status || 'open');
      setThreadClosureDueAt(data.closureDueAt || null);
      setThreadResolvedAt(data.resolvedAt || null);
      setThreadResolutionReason(data.resolutionReason || null);
    } catch (error) {
      console.warn('[FloatingChat] Failed to load older messages:', error);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Mark as read when opened (skip stub threads)
  useEffect(() => {
    if (isOpen && threadId && !threadId.startsWith('stub-') && isLoggedIn && accessToken && unreadCount > 0) {
      fetch(`${API_BASE_URL}/chat/private/${threadId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(() => setUnreadCount(0)).catch(e => console.warn('[FloatingChat] Failed to mark as read:', e));
    }
  }, [isOpen, threadId, isLoggedIn, accessToken, unreadCount]);

  // Live updates for logged-in users (SSE)
  useEffect(() => {
    if (!threadId || threadId.startsWith('stub-') || !isLoggedIn || !accessToken) return;

    const streamUrl = `${API_BASE_URL.replace(/\/$/, '')}/realtime/stream?token=${encodeURIComponent(accessToken)}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data || '{}');
        const eventType = data?.type as string | undefined;
        const payload = (data?.payload || {}) as Record<string, any>;

        if (
          eventType === 'chat.message.created' &&
          payload.sourceType === 'private' &&
          payload.threadId === threadId &&
          payload.message
        ) {
          const incoming = payload.message as ChatMessage;
          setMessages((prev) => {
            if (prev.some((item) => item.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (!isOpen && incoming.senderType === 'foh') {
            setUnreadCount((prev) => prev + 1);
          }
        }

        if (
          eventType === 'thread.status.changed' &&
          payload.sourceType === 'private' &&
          payload.threadId === threadId
        ) {
          const currentLimit = Math.max(messages.length || CHAT_PAGE_SIZE, CHAT_PAGE_SIZE);
          const projectIdParam = chatContext.projectId ? `&projectId=${encodeURIComponent(chatContext.projectId)}` : '';
          fetch(`${API_BASE_URL}/chat/private/${threadId}?includeArchived=1&messageLimit=${currentLimit}&messageOffset=0${projectIdParam}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((thread) => {
              if (!thread) return;
              setMessages(thread.messages || []);
              setThreadStatus(thread.status || 'open');
              setThreadClosureDueAt(thread.closureDueAt || null);
              setThreadResolvedAt(thread.resolvedAt || null);
              setThreadResolutionReason(thread.resolutionReason || null);
              setHasOlderMessages(Boolean(thread.hasMoreMessages));
              if (!isOpen) {
                setUnreadCount(thread.unreadCount || 0);
              }
            })
            .catch(() => {
              // no-op
            });
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      eventSource.close();
    };
  }, [isOpen, threadId, isLoggedIn, accessToken, messages.length]);

  const doSend = async (text: string, attachmentsToSend: { url: string; filename: string }[]): Promise<boolean> => {
    if ((!text.trim() && attachmentsToSend.length === 0) || !threadId || sending) return false;

    setSending(true);
    try {
      // For stub threads with logged-in users, try to create a real thread first
      let actualThreadId = threadId;
      if (threadId.startsWith('stub-') && isLoggedIn && accessToken) {
        console.log('[FloatingChat] Stub thread detected, attempting to create real thread...');
        try {
          const createRes = await fetch(`${API_BASE_URL}/chat/private`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ projectId: chatContext.projectId ?? null }),
          });
          if (createRes.ok) {
            const data = await createRes.json();
            const candidateThreadId = data.threadId || data.id;
            const expectedProjectId = chatContext.pageType === 'project_view' ? chatContext.projectId ?? null : null;
            const actualProjectId = data.projectId ?? null;
            if (actualProjectId !== expectedProjectId) {
              console.warn('[FloatingChat] Stub upgrade thread mismatch, keeping stub for current context', {
                candidateThreadId,
                expectedProjectId,
                actualProjectId,
              });
              storeThreadId(chatContext, null);
            } else if (candidateThreadId) {
              actualThreadId = candidateThreadId;
              console.log('[FloatingChat] Created real thread, using:', actualThreadId);
              setThreadId(actualThreadId);
              storeThreadId(chatContext, actualThreadId);
            }
          }
        } catch (e) {
          console.warn('[FloatingChat] Failed to create real thread:', e);
          // Fall through and try with stub anyway
        }
      }

      // For stub threads, do not show false success for logged-in users.
      if (actualThreadId.startsWith('stub-')) {
        if (isLoggedIn) {
          toast.error('Unable to connect support thread right now. Please retry in a few seconds.');
          return false;
        }
        console.log('[FloatingChat] Sending to stub thread:', actualThreadId);
        setMessages((prev) => [...prev, {
          id: Date.now().toString(),
          senderType: userRole === 'professional' ? 'professional' : userRole === 'client' ? 'user' : 'anonymous',
          content: text.trim(),
          attachments: attachmentsToSend,
          context: chatContext,
          createdAt: new Date().toISOString(),
        }]);
        toast.success('Admin notified, they will reply shortly');
        if (chatContext.pageType === 'project_view') {
          storeThreadId(chatContext, actualThreadId);
        }
        return true;
      }

      const endpoint = isLoggedIn && accessToken
        ? `${API_BASE_URL}/chat/private/${actualThreadId}/messages`
        : `${API_BASE_URL}/chat/anonymous/${actualThreadId}/messages`;
      
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      console.log('[FloatingChat] Sending message to endpoint:', endpoint, 'Thread:', actualThreadId, 'User role:', userRole);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          content: text.trim(),
          attachments: attachmentsToSend,
          context: chatContext,
        }),
      });

      console.log('[FloatingChat] Response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[FloatingChat] Message sent successfully:', data);
        setMessages((prev) => [...prev, data.message || {
          id: Date.now().toString(),
          senderType: userRole === 'professional' ? 'professional' : userRole === 'client' ? 'user' : 'anonymous',
          content: text.trim(),
          attachments: attachmentsToSend,
          context: chatContext,
          createdAt: new Date().toISOString(),
        }]);
        setThreadStatus('in_progress');
        setThreadClosureDueAt(null);
        setThreadResolvedAt(null);
        toast.success('Admin notified, they will reply shortly');
        if (chatContext.pageType === 'project_view') {
          storeThreadId(chatContext, actualThreadId);
        }
        return true;
      } else {
        const errorText = await res.text();
        console.error('[FloatingChat] Failed to send message:', res.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('[FloatingChat] Error sending message:', error);
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && pendingAttachments.length === 0) || !threadId || sending) return;
    const sent = await doSend(message.trim(), pendingAttachments);
    if (sent) {
      setMessage('');
      setPendingAttachments([]);
    }
  };

  // Don't show on admin pages.
  if (isAdminPage) return null;

  return (
    <>
      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed top-1/2 right-6 -translate-y-1/2 z-50 w-96 h-[500px] bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between bg-blue-600 text-white px-4 py-3 rounded-t-lg">
            <div>
              <h3 className="font-semibold">Chat with Fitout Hub</h3>
              <p className="text-xs text-blue-100">{isLoggedIn ? contextLabel : 'Anonymous support chat'}</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-slate-200 transition"
              aria-label="Close chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {(threadStatus === 'closure_pending' || threadStatus === 'closed') && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                {threadStatus === 'closure_pending'
                  ? `Fitout Hub marked this conversation as pending closure${threadClosureDueAt ? ` until ${new Date(threadClosureDueAt).toLocaleString()}` : ''}.${threadResolutionReason ? ` ${threadResolutionReason}.` : ''} Reply here if you still need help.`
                  : `This conversation was closed${threadResolvedAt ? ` on ${new Date(threadResolvedAt).toLocaleString()}` : ''}.${threadResolutionReason ? ` ${threadResolutionReason}.` : ''} Reply here to reopen it.`}
              </div>
            )}
            {hasOlderMessages && !loading && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadOlderMessages()}
                  disabled={loadingOlderMessages}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingOlderMessages ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}
            {loading ? (
              <div className="text-center text-slate-500 text-sm mt-8">Loading chat...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-slate-500 text-sm mt-8">
                <p>Welcome to Fitout Hub support!</p>
                <p className="mt-2">Ask questions, get help, or report issues.</p>
                <p className="mt-1 text-xs text-slate-400">Start a conversation below</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isFoh = msg.senderType === 'foh';
                const isUser = msg.senderType === userRole || msg.senderType === 'user';
                return (
                  <div
                    key={msg.id || idx}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                        isUser
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      {!isUser && (
                        <div className="text-xs font-semibold mb-1 opacity-75">
                          {isFoh ? 'Fitout Hub' : 'Support'}
                        </div>
                      )}
                      
                      {/* Message content */}
                      {msg.content && (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                      
                      {/* Image attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={`${msg.content ? 'mt-2' : ''} flex gap-2 overflow-x-auto`}>
                          {msg.attachments.map((att, i) => (
                            <ChatImageAttachment 
                              key={i} 
                              url={att.url} 
                              filename={att.filename}
                              className="flex-shrink-0 bg-white p-1 rounded"
                            />
                          ))}
                        </div>
                      )}
                      
                      <div className="text-xs opacity-60 mt-1">
                        {new Date(msg.createdAt).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="border-t border-slate-200 p-4">
            {/* Image uploader */}
            <div className="mb-3">
              <ChatImageUploader
                onImagesUploaded={(images) => setPendingAttachments((prev) => [...prev, ...images])}
                maxImages={3}
                disabled={sending || loading || !threadId}
              />
            </div>

            {/* Show pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="mb-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-600 mb-2 font-medium">
                  {pendingAttachments.length} image{pendingAttachments.length > 1 ? 's' : ''} ready to send
                </div>
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((att, i) => (
                    <div key={i} className="relative group">
                      <img 
                        src={att.url} 
                        alt={att.filename} 
                        className="w-16 h-16 object-cover rounded border border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs hover:bg-red-600 shadow-md"
                      >
                        ×
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 truncate opacity-0 group-hover:opacity-100 transition">
                        {att.filename}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Quick-action shortcuts */}
            {isLoggedIn && (
              <div className="flex gap-2 mb-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => doSend('📱 Please contact me via WhatsApp.', [])}
                  disabled={sending || loading || !threadId}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  📱 WhatsApp me
                </button>
                <button
                  type="button"
                  onClick={() => doSend('📞 Please give me a call to discuss this.', [])}
                  disabled={sending || loading || !threadId}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  📞 Call me
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                disabled={sending || loading || !threadId}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={(!message.trim() && pendingAttachments.length === 0) || sending || loading || !threadId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Floating Chat Button - Hidden when modal is open */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[180px] right-6 z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group attention-wiggle overflow-hidden"
          aria-label="Open chat"
          title="Chat with Fitout Hub support"
        >
          <Image
            src="/assets/images/chatbot-avatar-icon.webp"
            alt="Fitout Hub Chat Avatar"
            width={56}
            height={56}
            className="w-full h-full object-cover"
            priority
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          
          {/* Tooltip on hover */}
          <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Chat with Fitout Hub support
            <span className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-slate-900"></span>
          </span>
        </button>
      )}

      <style jsx>{`
        @keyframes wink-wiggle {
          0%, 80%, 100% { transform: rotate(0deg) scale(1); box-shadow: 0 10px 20px rgba(59,130,246,0.25); }
          85% { transform: rotate(-4deg) scale(1.02); }
          90% { transform: rotate(4deg) scale(1.02); }
          95% { transform: rotate(0deg) scale(1.04); box-shadow: 0 12px 28px rgba(59,130,246,0.35); }
        }
        .attention-wiggle {
          animation: wink-wiggle 3.2s ease-in-out infinite;
        }
        .attention-wiggle:hover {
          animation-play-state: paused;
        }
      `}</style>
    </>
  );
}
