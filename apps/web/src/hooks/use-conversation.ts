'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: string;
  senderType: 'client' | 'professional' | 'foh' | string;
  senderName?: string;
  threadScope?: string;
  threadScopeId?: string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
}

export type ConversationChatType =
  | 'project-general'
  | 'project-professional'
  | 'project-private'
  | 'project-assist';

interface UseConversationOptions {
  /** Logical chat type — determines which backend endpoints are called. */
  chatType: ConversationChatType;
  /**
   * The primary thread identifier.
   * - project-general:      projectId
   * - project-professional: projectProfessionalId
   * - project-private:      projectProfessionalId (client view)
   * - project-assist:       assistRequestId
   */
  threadId: string;
  /** Optional narrowing scope within the thread (e.g. "claim", "progress"). */
  threadScope?: string;
  threadScopeId?: string;
  accessToken: string;
  /** Increment to trigger a fresh fetch without remounting. */
  refreshToken?: number;
  /** Called after a message is successfully sent. */
  onMessageSent?: () => void;
}

interface UseConversationReturn {
  messages: ConversationMessage[];
  loading: boolean;
  error: string | null;
  /** ID of the first unread message — use to render the "New messages" divider. */
  firstUnreadMessageId: string | null;
  /**
   * ID to scroll into view on initial load.
   * Equal to firstUnreadMessageId when there are unread messages; otherwise the
   * last message id.
   */
  initialAnchorMessageId: string | null;
  sending: boolean;
  sendError: string | null;
  sendMessage: (content: string, attachments?: { url: string; filename: string }[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers — resolve endpoint URLs per chatType
// ---------------------------------------------------------------------------

function resolveMessagesUrl(chatType: ConversationChatType, threadId: string, threadScope?: string, threadScopeId?: string): string {
  switch (chatType) {
    case 'project-general': {
      const url = new URL(`${API_BASE_URL}/projects/${threadId}/chat`);
      if (threadScope && threadScopeId) {
        url.searchParams.set('threadScope', threadScope);
        url.searchParams.set('threadScopeId', threadScopeId);
      }
      return url.toString();
    }
    case 'project-professional':
      return `${API_BASE_URL}/professional/projects/${threadId}/messages`;
    case 'project-private':
      return `${API_BASE_URL}/client/projects/${threadId}/messages`;
    case 'project-assist':
      return `${API_BASE_URL}/assist-requests/${threadId}/messages`;
    default:
      return `${API_BASE_URL}/projects/${threadId}/chat`;
  }
}

function resolveMarkReadUrl(chatType: ConversationChatType, threadId: string): string {
  switch (chatType) {
    case 'project-general':
      return `${API_BASE_URL}/projects/${threadId}/chat/read`;
    case 'project-professional':
      return `${API_BASE_URL}/professional/projects/${threadId}/messages/mark-read`;
    case 'project-private':
      return `${API_BASE_URL}/client/projects/${threadId}/messages/mark-read`;
    case 'project-assist':
      return `${API_BASE_URL}/assist-requests/${threadId}/messages/mark-read`;
    default:
      return `${API_BASE_URL}/projects/${threadId}/chat/read`;
  }
}

function resolveSendUrl(chatType: ConversationChatType, threadId: string): string {
  switch (chatType) {
    case 'project-general':
      return `${API_BASE_URL}/projects/${threadId}/chat/messages`;
    case 'project-professional':
      return `${API_BASE_URL}/professional/projects/${threadId}/messages`;
    case 'project-private':
      return `${API_BASE_URL}/client/projects/${threadId}/messages`;
    case 'project-assist':
      return `${API_BASE_URL}/assist-requests/${threadId}/messages`;
    default:
      return `${API_BASE_URL}/projects/${threadId}/chat/messages`;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConversation({
  chatType,
  threadId,
  threadScope,
  threadScopeId,
  accessToken,
  refreshToken = 0,
  onMessageSent,
}: UseConversationOptions): UseConversationReturn {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [initialAnchorMessageId, setInitialAnchorMessageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Guard so we only compute the anchor on the very first successful load
  const didComputeAnchorRef = useRef(false);

  // ---- Fetch messages + read-marker ----------------------------------------

  useEffect(() => {
    if (!threadId || !accessToken) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        didComputeAnchorRef.current = false;
        setInitialAnchorMessageId(null);
        setFirstUnreadMessageId(null);

        // 1. Load messages
        const messagesUrl = resolveMessagesUrl(chatType, threadId, threadScope, threadScopeId);
        const res = await fetch(messagesUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (cancelled) return;

        if (res.status === 404) {
          setMessages([]);
          return;
        }
        if (!res.ok) throw new Error('Failed to load messages');

        const data = await res.json();
        const fetched: ConversationMessage[] = data.messages || data || [];

        // 2. Load read-marker from centralized endpoint (non-blocking)
        let firstUnreadId: string | null = data.firstUnreadMessageId ?? null;
        let lastReadId: string | null = data.lastReadMessageId ?? null;

        const innerThreadId: string | null =
          chatType === 'project-general' ? (data.threadId ?? data.id ?? null) : threadId;

        if (innerThreadId) {
          try {
            const markerUrl = new URL(`${API_BASE_URL}/updates/messages/read-marker`);
            markerUrl.searchParams.set('chatType', chatType);
            markerUrl.searchParams.set('threadId', innerThreadId);
            if (threadScope && threadScopeId) {
              markerUrl.searchParams.set('threadScope', threadScope);
              markerUrl.searchParams.set('threadScopeId', threadScopeId);
            }
            const markerRes = await fetch(markerUrl.toString(), {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!cancelled && markerRes.ok) {
              const markerData = await markerRes.json();
              firstUnreadId = markerData.firstUnreadMessageId ?? firstUnreadId;
              lastReadId = markerData.lastReadMessageId ?? lastReadId;
            }
          } catch {
            // Non-blocking — keep payload markers as fallback
          }
        }

        if (cancelled) return;

        // 3. Compute scroll anchor
        if (fetched.length > 0) {
          if (firstUnreadId) {
            const idx = fetched.findIndex((m) => m.id === firstUnreadId);
            if (idx >= 0) {
              setInitialAnchorMessageId(fetched[idx].id);
              setFirstUnreadMessageId(fetched[idx].id);
            } else {
              setInitialAnchorMessageId(fetched[fetched.length - 1].id);
            }
          } else if (lastReadId) {
            const readIdx = fetched.findIndex((m) => m.id === lastReadId);
            if (readIdx >= 0 && readIdx < fetched.length - 1) {
              setInitialAnchorMessageId(fetched[readIdx + 1].id);
              setFirstUnreadMessageId(fetched[readIdx + 1].id);
            } else {
              setInitialAnchorMessageId(fetched[fetched.length - 1].id);
            }
          } else {
            setInitialAnchorMessageId(fetched[fetched.length - 1].id);
          }
        }

        setMessages(fetched);

        // 4. Mark as read
        const newest = fetched[fetched.length - 1];
        if (newest) {
          const markReadUrl = resolveMarkReadUrl(chatType, threadId);
          fetch(markReadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ lastMessageId: newest.id }),
          }).catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chat');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [chatType, threadId, threadScope, threadScopeId, accessToken, refreshToken]);

  // ---- Send message --------------------------------------------------------

  const sendMessage = useCallback(
    async (content: string, attachments: { url: string; filename: string }[] = []) => {
      if (!content.trim() && attachments.length === 0) return;

      setSending(true);
      setSendError(null);

      try {
        const sendUrl = resolveSendUrl(chatType, threadId);
        const body: Record<string, unknown> = { content: content.trim(), attachments };
        if (chatType === 'project-general' && threadScope && threadScopeId) {
          body.threadScope = threadScope;
          body.threadScopeId = threadScopeId;
        }

        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error('Failed to send message');

        const data = await res.json();
        const newMsg: ConversationMessage = data.message ?? data;
        setMessages((prev) => [...prev, newMsg]);

        if (onMessageSent) onMessageSent();
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [chatType, threadId, threadScope, threadScopeId, accessToken, onMessageSent],
  );

  return {
    messages,
    loading,
    error,
    firstUnreadMessageId,
    initialAnchorMessageId,
    sending,
    sendError,
    sendMessage,
  };
}
