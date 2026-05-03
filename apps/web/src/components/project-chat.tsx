'use client';

import { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import ChatImageAttachment from './chat-image-attachment';
import ChatImageUploader from './chat-image-uploader';

interface ChatMessage {
  id: string;
  senderType: 'client' | 'professional' | 'foh';
  senderName?: string;
  threadScope?: string;
  threadScopeId?: string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
}

interface ProjectChatProps {
  projectId: string;
  accessToken: string;
  currentUserRole: 'client' | 'professional' | 'admin';
  threadScope?: string;
  threadScopeId?: string;
  sendButtonLabel?: string;
  messagePlaceholder?: string;
  className?: string;
  onMessageSent?: () => void;
  /** When true, the messages area grows to fill the parent height instead of capping at 500px.
   *  Requires the parent to have a defined height (e.g. h-full + flex-col on the ancestor). */
  fillHeight?: boolean;
  /** Increment to force a message list refetch without remounting the chat component. */
  refreshToken?: number;
  /** Optional custom header title. */
  headerTitle?: string;
  /** Optional custom subtitle; pass empty string to hide subtitle. */
  headerSubtitle?: string;
  /** Whether to show the active presence chip in the header. */
  showPresenceIndicator?: boolean;
}

export default function ProjectChat({
  projectId,
  accessToken,
  currentUserRole,
  threadScope,
  threadScopeId,
  sendButtonLabel = 'Send',
  messagePlaceholder = 'Type a message to the project team...',
  className = '',
  onMessageSent,
  fillHeight = false,
  refreshToken = 0,
  headerTitle = 'Project Team Chat',
  headerSubtitle = 'Client, awarded professionals & Fitout Hub',
  showPresenceIndicator = true,
}: ProjectChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploaderClearKey, setUploaderClearKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialAnchorMessageId, setInitialAnchorMessageId] = useState<string | null>(null);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const didInitialPositionRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  const getReadMarkerStorageKey = () => {
    const scope = threadScope || 'all';
    const scopeId = threadScopeId || 'all';
    return `project-chat:last-viewed:${projectId}:${scope}:${scopeId}`;
  };

  const persistReadMarker = (timestamp: string) => {
    try {
      window.localStorage.setItem(getReadMarkerStorageKey(), timestamp);
    } catch {
      // ignore storage failures (private browsing / quota)
    }
  };

  const getStoredReadMarker = () => {
    try {
      return window.localStorage.getItem(getReadMarkerStorageKey());
    } catch {
      return null;
    }
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setLoading(true);
        setError(null);
        didInitialPositionRef.current = false;
        previousMessageCountRef.current = 0;
        setInitialAnchorMessageId(null);
        setFirstUnreadMessageId(null);
        const chatUrl = new URL(`${API_BASE_URL}/projects/${projectId}/chat`);
        if (threadScope && threadScopeId) {
          chatUrl.searchParams.set('threadScope', threadScope);
          chatUrl.searchParams.set('threadScopeId', threadScopeId);
        }

        const res = await fetch(chatUrl.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (res.status === 404) {
          // No chat thread yet - will be created on first message
          setMessages([]);
          return;
        }

        if (!res.ok) {
          throw new Error('Failed to load project chat');
        }

        const data = await res.json();
        const fetchedMessages = data.messages || [];

        // Prefer server-provided read cursor; fall back to localStorage timestamp
        const serverLastReadId: string | null = data.lastReadMessageId ?? null;
        const serverFirstUnreadId: string | null = data.firstUnreadMessageId ?? null;
        const lastReadMarker = getStoredReadMarker();

        if (fetchedMessages.length > 0) {
          if (serverFirstUnreadId) {
            const unreadIndex = fetchedMessages.findIndex(
              (m: ChatMessage) => m.id === serverFirstUnreadId,
            );
            if (unreadIndex >= 0) {
              setInitialAnchorMessageId(fetchedMessages[unreadIndex].id);
              setFirstUnreadMessageId(fetchedMessages[unreadIndex].id);
            } else {
              setInitialAnchorMessageId(fetchedMessages[fetchedMessages.length - 1].id);
            }
          } else if (serverLastReadId) {
            // Anchor at the server-known last-read message (unread starts just after)
            const serverReadIndex = fetchedMessages.findIndex(
              (m: ChatMessage) => m.id === serverLastReadId,
            );
            if (serverReadIndex >= 0 && serverReadIndex < fetchedMessages.length - 1) {
              setInitialAnchorMessageId(fetchedMessages[serverReadIndex + 1].id);
              setFirstUnreadMessageId(fetchedMessages[serverReadIndex + 1].id);
            } else {
              setInitialAnchorMessageId(fetchedMessages[fetchedMessages.length - 1].id);
            }
          } else if (lastReadMarker) {
            const firstUnreadIndex = fetchedMessages.findIndex(
              (msg: ChatMessage) => new Date(msg.createdAt).getTime() > new Date(lastReadMarker).getTime(),
            );

            if (firstUnreadIndex > 0) {
              setInitialAnchorMessageId(fetchedMessages[firstUnreadIndex].id);
              setFirstUnreadMessageId(fetchedMessages[firstUnreadIndex].id);
            } else if (firstUnreadIndex === 0) {
              // All currently loaded messages are unread: anchor to the first unread
              setInitialAnchorMessageId(fetchedMessages[0].id);
              setFirstUnreadMessageId(fetchedMessages[0].id);
            } else {
              // No unread messages found from local marker
              setInitialAnchorMessageId(fetchedMessages[fetchedMessages.length - 1].id);
            }
          } else {
            setInitialAnchorMessageId(fetchedMessages[fetchedMessages.length - 1].id);
          }
        }

        setMessages(fetchedMessages);
        
        // Mark as read — pass the newest message ID so the server can track the exact watermark
        const newestMessage = fetchedMessages[fetchedMessages.length - 1];
        if (newestMessage) {
          await fetch(`${API_BASE_URL}/projects/${projectId}/chat/read`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ lastMessageId: newestMessage.id }),
          });

          if (newestMessage.createdAt) {
            persistReadMarker(newestMessage.createdAt);
          }
        }
      } catch (err) {
        console.error('Error loading project chat:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chat');
      } finally {
        setLoading(false);
      }
    };

    if (projectId && accessToken) {
      fetchMessages();
    }
  }, [projectId, accessToken, threadScope, threadScopeId, refreshToken]);

  useEffect(() => {
    if (!messagesContainerRef.current || messages.length === 0) return;

    if (!didInitialPositionRef.current) {
      if (initialAnchorMessageId) {
        const dividerEl = document.getElementById(`project-chat-divider-${initialAnchorMessageId}`);
        const anchorEl = dividerEl || document.getElementById(`project-chat-message-${initialAnchorMessageId}`);
        if (anchorEl) {
          anchorEl.scrollIntoView({ behavior: 'auto', block: firstUnreadMessageId ? 'start' : 'center' });
        } else {
          scrollToBottom();
        }
      } else {
        scrollToBottom();
      }
      didInitialPositionRef.current = true;
      previousMessageCountRef.current = messages.length;
      return;
    }

    if (messages.length > previousMessageCountRef.current) {
      scrollToBottom();
    }
    previousMessageCountRef.current = messages.length;
  }, [messages, initialAnchorMessageId, firstUnreadMessageId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && pendingFiles.length === 0) || sending) return;

    setSending(true);
    setError(null);

    try {
      // Upload any pending files first
      let attachments: { url: string; filename: string }[] = [];
      if (pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach((file) => formData.append('files', file));
        if (projectId) formData.append('projectId', projectId);

        const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
          method: 'POST',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          body: formData,
        });

        if (!uploadRes.ok) {
          const text = await uploadRes.text();
          throw new Error(text || 'Image upload failed');
        }

        const uploadData = await uploadRes.json();
        attachments = uploadData.urls.map((url: string, i: number) => ({
          url,
          filename: pendingFiles[i].name,
        }));
      }

      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content: newMessage.trim(),
          attachments,
          threadScope,
          threadScopeId,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      if (data?.message?.createdAt) {
        persistReadMarker(data.message.createdAt);
      }
      setNewMessage('');
      setPendingFiles([]);
      setUploaderClearKey((k) => k + 1);
      
      // Fire onMessageSent callback if provided
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getSenderLabel = (msg: ChatMessage): string => {
    if (msg.senderName) return msg.senderName;
    if (msg.senderType === 'foh') return 'Fitout Hub';
    if (msg.senderType === 'client') return 'Client';
    if (msg.senderType === 'professional') return 'Professional';
    return 'Unknown';
  };

  const isCurrentUser = (msg: ChatMessage): boolean => {
    if (currentUserRole === 'admin') return false; // Admin never "owns" messages
    return msg.senderType === currentUserRole;
  };

  return (
    <div className={`min-w-0 max-w-full overflow-x-hidden rounded-lg border border-slate-700 bg-slate-900/60 shadow-sm${fillHeight ? ' flex h-full min-h-0 flex-col' : ''} ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{headerTitle}</h3>
            {headerSubtitle.trim() ? (
              <p className="text-xs text-slate-300">{headerSubtitle}</p>
            ) : null}
          </div>
          {showPresenceIndicator ? (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live chat"></div>
              <span className="text-xs text-emerald-300 font-medium">Active</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className={`min-w-0 space-y-3 overflow-x-hidden overflow-y-auto p-4 ${fillHeight ? 'flex-1 min-h-0' : 'min-h-[300px] max-h-[500px]'}`}>
        {loading ? (
          <div className="text-center text-slate-400 text-sm py-8">Loading chat...</div>
        ) : error ? (
          <div className="text-center text-rose-300 text-sm py-8">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-8">
            <p>No messages yet.</p>
            <p className="mt-1 text-xs">Start the conversation with your project team!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCurrent = isCurrentUser(msg);
            const isFoh = msg.senderType === 'foh';
            
            return (
              <div key={msg.id}>
                {firstUnreadMessageId === msg.id && (
                  <div id={`project-chat-divider-${msg.id}`} className="my-2 flex items-center gap-3">
                    <div className="h-px flex-1 bg-amber-500/40" />
                    <span className="shrink-0 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                      New messages
                    </span>
                    <div className="h-px flex-1 bg-amber-500/40" />
                  </div>
                )}

                <div id={`project-chat-message-${msg.id}`} className={`flex min-w-0 ${isCurrent ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`min-w-0 max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                      isCurrent
                        ? 'bg-emerald-600 text-white'
                        : isFoh
                        ? 'bg-emerald-500/15 text-white border border-emerald-500/40'
                        : 'bg-slate-800 text-white border border-slate-700'
                    }`}
                  >
                    {!isCurrent && (
                      <div className={`text-xs font-semibold mb-1 ${isFoh ? 'text-emerald-300' : 'text-slate-300'}`}>
                        {getSenderLabel(msg)}
                      </div>
                    )}

                    {/* Message content */}
                    {msg.content && <div className="whitespace-pre-wrap break-words">{msg.content}</div>}

                    {/* Image attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`${msg.content ? 'mt-2' : ''} space-y-2`}>
                        {msg.attachments.map((att, i) => (
                          <ChatImageAttachment 
                            key={i} 
                            url={att.url} 
                            filename={att.filename}
                          />
                        ))}
                      </div>
                    )}

                    <div className={`text-xs mt-1 ${isCurrent ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {new Date(msg.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-slate-700 p-4">
        {error && (
          <div className="mb-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/40 rounded px-2 py-1">
            {error}
          </div>
        )}
        
        {/* Image uploader — files are uploaded on send */}
        <div className="mb-3">
          <ChatImageUploader
            onFilesSelected={setPendingFiles}
            maxImages={3}
            disabled={sending || loading}
            clearKey={uploaderClearKey}
          />
        </div>
        
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={messagePlaceholder}
            disabled={sending || loading}
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-900"
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && pendingFiles.length === 0) || sending || loading}
            className="w-full shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-700 sm:w-auto"
          >
            {sending
              ? (pendingFiles.length > 0 ? 'Uploading & Sending...' : 'Sending...')
              : sendButtonLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
