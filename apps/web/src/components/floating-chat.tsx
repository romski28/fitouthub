'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { parseChatEvent } from '@/lib/chat-event-parser';
import ChatEventCard from './chat-event-card';
import ChatImageAttachment from './chat-image-attachment';
import { EmergencyModal } from './emergency-modal';
import { AssistRequestModal, type AssistRequestModalSubmit } from './assist-request-modal';

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState<string[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
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
  const [pendingAutoMessage, setPendingAutoMessage] = useState<string | null>(null);
  const [contextOverride, setContextOverride] = useState<ChatContext | null>(null);
  const [projectNameHint, setProjectNameHint] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [showAnonCards, setShowAnonCards] = useState(false);
  const [endingAnonChat, setEndingAnonChat] = useState(false);
  const [forceThreadBootstrap, setForceThreadBootstrap] = useState(0);
  const [consultationOpen, setConsultationOpen] = useState(false);
  const bypassCardTriageRef = useRef(false);
  const autoSendInFlightRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const suppressNextAutoScrollRef = useRef(false);

  const isAdminPage = pathname?.startsWith('/admin');
  const isLoggedIn = clientLoggedIn || proLoggedIn;
  const accessToken = clientToken || proToken;
  const userRole = clientLoggedIn ? 'client' : proLoggedIn ? 'professional' : 'anonymous';
  const generalChatContext = useMemo<ChatContext>(() => ({
    pageType: 'general',
    pathname: '/',
    projectId: null,
    projectName: null,
  }), []);
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
    // Keep floating support chat unscoped for now.
    return generalChatContext;
  }, [generalChatContext]);
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
      setPendingAutoMessage(null);
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
      const customEvent = event as CustomEvent<{
        context?: 'project_creation' | 'project_view' | 'general';
        projectId?: string;
        projectName?: string;
        initialMessage?: string;
        autoSendInitialMessage?: boolean;
      }>;
      const detail = customEvent.detail || {};

      setContextOverride(null);
      if (detail.initialMessage?.trim()) {
        const trimmedInitial = detail.initialMessage.trim();
        if (detail.autoSendInitialMessage) {
          setPendingAutoMessage(trimmedInitial);
          setMessage('');
        } else {
          // For regular opens, keep composer empty for the user to start typing.
          setMessage('');
        }
      } else {
        setMessage('');
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
      // Anonymous with no stored thread → show card triage, unless user explicitly chose to start chat
      if (!isLoggedIn && !bypassCardTriageRef.current) {
        const stored = readStoredThreadId(chatContext);
        if (!stored) {
          setShowAnonCards(true);
          setLoading(false);
          return;
        }
        setShowAnonCards(false);
      }
      console.log('[FloatingChat] Opening chat, loading thread...');
      loadThread();
    }
  }, [isOpen, isLoggedIn, accessToken, userRole, chatContext, threadId, forceThreadBootstrap]);

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
      suppressNextAutoScrollRef.current = true;
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

  useEffect(() => {
    if (!isOpen) return;
    if (!messagesContainerRef.current) return;
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false;
      return;
    }
    const node = messagesContainerRef.current;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [isOpen, messages.length]);

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

  // ── Anonymous "End Chat" ──
  const handleEndAnonChat = useCallback(async () => {
    if (!threadId || threadId.startsWith('stub-')) {
      // No real thread — just flush local state
      setMessages([]);
      setThreadId(null);
      setShowAnonCards(false);
      setIsOpen(false);
      storeThreadId(chatContext, null);
      return;
    }
    setEndingAnonChat(true);
    try {
      await fetch(`${API_BASE_URL}/chat/anonymous/${threadId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User ended chat session' }),
      });
    } catch {
      // Best-effort — still clear locally
    }
    setMessages([]);
    setThreadId(null);
    setShowAnonCards(true);
    setEndingAnonChat(false);
    bypassCardTriageRef.current = false;
    storeThreadId(chatContext, null);
    toast.success('Chat ended. Your conversation has been saved.');
  }, [threadId, chatContext]);

  // ── Start chat from card triage with pre-filled message ──
  const handleStartAnonChat = useCallback((prefillMessage?: string) => {
    bypassCardTriageRef.current = true;
    setShowAnonCards(false);
    setThreadId(null);
    setMessages([]);
    if (prefillMessage) {
      setPendingAutoMessage(prefillMessage);
    }
    setForceThreadBootstrap((n) => n + 1);
  }, []);

  // ── Consultation submit handler ──
  const handleConsultationSubmit = useCallback(async (payload: AssistRequestModalSubmit) => {
    const res = await fetch(`${API_BASE_URL}/assist-requests/ai-consultation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead: {
          name: 'Website Visitor',
        },
        project: {
          projectName: 'Consultation request from Sarah chat',
        },
        assist: {
          notes: payload.notes,
          contactMethod: payload.contactMethod,
          requestedCallAt: payload.requestedCallAt,
          requestedCallTimezone: payload.requestedCallTimezone,
        },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any)?.message || 'Failed to submit consultation request');
    }
    return res.json() as Promise<{ caseNumber?: string }>;
  }, []);

  const doSend = async (
    text: string,
    attachmentsToSend: { url: string; filename: string }[],
    options?: { manageSendingState?: boolean },
  ): Promise<boolean> => {
    const manageSendingState = options?.manageSendingState ?? true;
    if ((!text.trim() && attachmentsToSend.length === 0) || !threadId || (manageSendingState && sending)) return false;

    if (manageSendingState) {
      setSending(true);
    }
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
        setMessages((prev) => {
          const outgoingMessage: ChatMessage = data.message || {
            id: Date.now().toString(),
            senderType: userRole === 'professional' ? 'professional' : userRole === 'client' ? 'user' : 'anonymous',
            content: text.trim(),
            attachments: attachmentsToSend,
            context: chatContext,
            createdAt: new Date().toISOString(),
          };

          if (outgoingMessage.id && prev.some((item) => item.id === outgoingMessage.id)) {
            return prev;
          }

          return [...prev, outgoingMessage];
        });
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
      if (manageSendingState) {
        setSending(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !pendingAutoMessage || !threadId || loading || sending) return;
    if (autoSendInFlightRef.current) return;

    let cancelled = false;
    const sendPendingInitialMessage = async () => {
      const messageToSend = pendingAutoMessage;
      autoSendInFlightRef.current = true;
      // Clear first to avoid re-triggering during doSend state transitions.
      setPendingAutoMessage(null);

      const sent = await doSend(messageToSend, []);
      if (cancelled) return;
      if (sent) {
        setMessage('');
      }
      autoSendInFlightRef.current = false;
    };

    void sendPendingInitialMessage();
    return () => {
      cancelled = true;
      autoSendInFlightRef.current = false;
    };
  }, [isOpen, pendingAutoMessage, threadId, loading, sending]);

  useEffect(() => {
    return () => {
      pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingPreviewUrls]);

  const handleInlineImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length > 3) {
      setImageUploadError('Maximum 3 images allowed');
      e.target.value = '';
      return;
    }

    const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setImageUploadError(`File too large: ${oversized.name} (max 10MB)`);
      e.target.value = '';
      return;
    }

    const invalid = files.find((file) => !file.type.startsWith('image/'));
    if (invalid) {
      setImageUploadError(`Invalid file type: ${invalid.name} (images only)`);
      e.target.value = '';
      return;
    }

    setImageUploadError(null);
    pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPendingFiles(files);
    setPendingPreviewUrls(files.map((file) => URL.createObjectURL(file)));
    e.target.value = '';
  };

  const removePendingImage = (index: number) => {
    const nextFiles = pendingFiles.filter((_, i) => i !== index);
    const nextUrls = pendingPreviewUrls.filter((_, i) => i !== index);
    setPendingFiles(nextFiles);
    setPendingPreviewUrls(nextUrls);
    setImageUploadError(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && pendingFiles.length === 0) || !threadId || sending) return;

    setSending(true);

    // Upload any pending files before sending
    let attachmentsToSend: { url: string; filename: string }[] = [];
    if (pendingFiles.length > 0) {
      try {
        const formData = new FormData();
        pendingFiles.forEach((file) => formData.append('files', file));
        if (chatContext.projectId) formData.append('projectId', chatContext.projectId);

        const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
          method: 'POST',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          const uploadedUrls = Array.isArray(uploadData?.urls)
            ? uploadData.urls.filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0)
            : [];
          attachmentsToSend = uploadedUrls.map((url: string, i: number) => ({
            url,
            filename: pendingFiles[i]?.name || `image-${i + 1}`,
          }));
        } else {
          const payload = await uploadRes.json().catch(() => ({}));
          throw new Error(payload?.message || `Image upload failed (${uploadRes.status})`);
        }
      } catch (e) {
        console.warn('[FloatingChat] Image upload failed:', e);
        toast.error(e instanceof Error ? e.message : 'Image upload failed');
      }

      if (attachmentsToSend.length === 0) {
        setSending(false);
        return;
      }
    }

    const sent = await doSend(message.trim(), attachmentsToSend, { manageSendingState: false });
    if (sent) {
      setMessage('');
      pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPendingFiles([]);
      setPendingPreviewUrls([]);
      setImageUploadError(null);
    }
    setSending(false);
  };

  // Don't show on admin pages.
  if (isAdminPage) return null;

  return (
    <>
      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[calc(100vw-1.5rem)] max-w-[36rem] min-h-[500px] h-[50vh] max-h-[calc(100vh-1.5rem)] bg-amber-50 rounded-lg shadow-2xl border border-slate-200 flex flex-col md:left-auto md:right-6 md:translate-x-0">
          {/* Header */}
          <div className="flex items-center justify-between bg-[#ff6b5b] text-white px-4 py-3 rounded-t-lg">
            <div>
              <h3 className="text-lg font-semibold leading-tight">Chat with MIMO</h3>
              <p className="text-sm text-white/85">{isLoggedIn ? contextLabel : showAnonCards ? 'How can we help?' : 'Anonymous support chat'}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isLoggedIn && !showAnonCards && threadId && (
                <button
                  onClick={handleEndAnonChat}
                  disabled={endingAnonChat}
                  className="text-white/80 hover:text-white text-xs font-semibold px-2 py-1 rounded border border-white/30 hover:border-white/60 transition disabled:opacity-50"
                  aria-label="End chat"
                >
                  {endingAnonChat ? 'Ending…' : 'End Chat'}
                </button>
              )}
              <button
                onClick={() => { setIsOpen(false); setShowAnonCards(false); bypassCardTriageRef.current = false; }}
                className="text-white hover:text-slate-200 transition"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {showAnonCards ? (
            /* ── Card Triage for new anonymous users ── */
            <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-center">
              <p className="text-center text-slate-600 text-sm mb-5">
                👋 Welcome! How can we help you today?
              </p>
              <div className="grid gap-3">
                <button
                  onClick={() => { setIsOpen(false); setConsultationOpen(true); }}
                  className="w-full rounded-xl border border-emerald-200 bg-white p-4 text-left hover:border-emerald-400 hover:shadow-sm transition group"
                >
                  <div className="font-semibold text-slate-900 group-hover:text-emerald-700 transition">📋 Book a free consultation</div>
                  <div className="text-sm text-slate-500 mt-0.5">Speak with a renovation expert at a time that suits you</div>
                </button>
                <button
                  onClick={() => { setIsOpen(false); setEmergencyOpen(true); bypassCardTriageRef.current = false; }}
                  className="w-full rounded-xl border border-rose-200 bg-white p-4 text-left hover:border-rose-400 hover:shadow-sm transition group"
                >
                  <div className="font-semibold text-slate-900 group-hover:text-rose-700 transition">🚨 I have an emergency</div>
                  <div className="text-sm text-slate-500 mt-0.5">Urgent repairs — we'll connect you with available professionals fast</div>
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowAnonCards(false);
                    bypassCardTriageRef.current = false;
                    window.location.href = '/?focusPrompt=1';
                  }}
                  className="w-full rounded-xl border border-sky-200 bg-white p-4 text-left hover:border-sky-400 hover:shadow-sm transition group"
                >
                  <div className="font-semibold text-slate-900 group-hover:text-sky-700 transition">🏠 Help me describe my project</div>
                  <div className="text-sm text-slate-500 mt-0.5">Use our AI assistant to scope your renovation or repair</div>
                </button>
                <button
                  onClick={() => handleStartAnonChat()}
                  className="w-full rounded-xl border border-amber-200 bg-white p-4 text-left hover:border-amber-400 hover:shadow-sm transition group"
                >
                  <div className="font-semibold text-slate-900 group-hover:text-amber-700 transition">💬 Talk to a real person</div>
                  <div className="text-sm text-slate-500 mt-0.5">Start a conversation with the MIMO support team</div>
                </button>
              </div>
            </div>
          ) : (
            <>
          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {(threadStatus === 'closure_pending' || threadStatus === 'closed') && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-base leading-relaxed text-sky-900">
                {threadStatus === 'closure_pending'
                  ? `MIMO marked this conversation as pending closure${threadClosureDueAt ? ` until ${new Date(threadClosureDueAt).toLocaleString()}` : ''}.${threadResolutionReason ? ` ${threadResolutionReason}.` : ''} Reply here if you still need help.`
                  : `This conversation was closed${threadResolvedAt ? ` on ${new Date(threadResolvedAt).toLocaleString()}` : ''}.${threadResolutionReason ? ` ${threadResolutionReason}.` : ''} Reply here to reopen it.`}
              </div>
            )}
            {hasOlderMessages && !loading && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadOlderMessages()}
                  disabled={loadingOlderMessages}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingOlderMessages ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}
            {loading ? (
              <div className="text-center text-slate-500 text-base mt-8">Loading chat...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-slate-500 text-base mt-8 leading-relaxed">
                <p>Welcome to MIMO support!</p>
                <p className="mt-2">Ask questions, get help, or report issues.</p>
                <p className="mt-1 text-sm text-slate-400">Start a conversation below</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isFoh = msg.senderType === 'foh';
                const isUser = msg.senderType === userRole || msg.senderType === 'user';
                const event = parseChatEvent(msg.content || '');
                return (
                  <div
                    key={msg.id || idx}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`${event ? 'max-w-[88%]' : 'max-w-[78%] rounded-lg px-4 py-2 text-[18px] leading-7'} ${
                        event
                          ? ''
                          : isUser
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white text-slate-800 shadow-sm'
                      }`}
                    >
                      {!isUser && (
                        <div className="text-sm font-semibold mb-1 opacity-75">
                          {isFoh ? 'MIMO' : 'Support'}
                        </div>
                      )}
                      
                      {/* Message content */}
                      {msg.content && (
                        event
                          ? <ChatEventCard event={event} isCurrentUser={isUser} />
                          : <div className="whitespace-pre-wrap">{msg.content}</div>
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
                      
                      <div className="text-sm opacity-70 mt-1">
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
            
            {/* Quick-action shortcuts */}
            {isLoggedIn && (
              <div className="flex gap-2 mb-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => doSend('📱 Please contact me via WhatsApp.', [])}
                  disabled={sending || loading || !threadId}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  📱 WhatsApp me
                </button>
                <button
                  type="button"
                  onClick={() => doSend('📞 Please give me a call to discuss this.', [])}
                  disabled={sending || loading || !threadId}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  📞 Call me
                </button>
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setConsultationOpen(true); }}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 transition"
                >
                  📋 Book consultation
                </button>
              </div>
            )}

            <div className="flex gap-2 items-stretch">
              <label
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition shadow-sm ${sending || loading || !threadId ? 'bg-slate-400 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'}`}
                title="Attach images"
                aria-label="Attach images"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleInlineImageSelect}
                  disabled={sending || loading || !threadId}
                  className="hidden"
                />
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const imageFiles: File[] = [];
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.startsWith('image/')) {
                      const file = items[i].getAsFile();
                      if (file) imageFiles.push(file);
                    }
                  }
                  if (imageFiles.length > 0) {
                    e.preventDefault();
                    setPendingFiles((prev) => [...prev, ...imageFiles]);
                    setPendingPreviewUrls((prev) => [...prev, ...imageFiles.map((f) => URL.createObjectURL(f))]);
                  }
                }}
                placeholder="Type your message..."
                disabled={sending || loading || !threadId}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={(!message.trim() && pendingFiles.length === 0) || sending || loading || !threadId}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-base font-medium hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>

            {pendingFiles.length > 0 && (
              <div className="mt-2 flex items-start gap-2 overflow-x-auto pb-1">
                {pendingFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="relative shrink-0">
                    <img
                      src={pendingPreviewUrls[i]}
                      alt={file.name}
                      className="h-16 w-16 rounded-md border border-slate-300 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingImage(i)}
                      disabled={sending}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs text-white hover:bg-rose-600 disabled:opacity-50"
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {imageUploadError && (
              <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {imageUploadError}
              </div>
            )}
          </form>
          </>
        )}
        </div>
      )}

      {/* Floating Chat Button - Hidden when modal is open */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[180px] right-6 z-40 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group attention-wiggle overflow-hidden"
          aria-label="Open chat"
          title="Chat with MIMO support"
        >
          <Image
            src="/assets/images/chatbot-avatar-icon.webp"
            alt="Mimo Chat Avatar"
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
            Chat with MIMO support
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

      {/* ── Emergency Modal ── */}
      <EmergencyModal isOpen={emergencyOpen} onClose={() => setEmergencyOpen(false)} />

      {/* ── Consultation Modal ── */}
      <AssistRequestModal
        isOpen={consultationOpen}
        onClose={() => setConsultationOpen(false)}
        onSubmit={handleConsultationSubmit}
        context="pre-project"
        submitPrefix="Book consultation"
      />
    </>
  );
}
