'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useConversation, type ConversationMessage as ChatMessage } from '@/hooks/use-conversation';
import { parseChatEvent } from '@/lib/chat-event-parser';
import ChatImageAttachment from './chat-image-attachment';
import ChatEventCard from './chat-event-card';
import ChatImageUploader from './chat-image-uploader';

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
  headerSubtitle = 'Client, awarded professionals & Mimo',
  showPresenceIndicator = true,
}: ProjectChatProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [uploaderClearKey, setUploaderClearKey] = useState(0);
  const [newMessage, setNewMessage] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const didInitialPositionRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  const {
    messages,
    loading,
    error,
    firstUnreadMessageId,
    initialAnchorMessageId,
    sending,
    sendError,
    sendMessage: conversationSend,
  } = useConversation({
    chatType: 'project-general',
    threadId: projectId,
    threadScope,
    threadScopeId,
    accessToken,
    refreshToken,
    onMessageSent,
  });

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    const scrollToBottom = () => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    };

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
    if ((!newMessage.trim() && pendingFiles.length === 0) || sending || uploadingAttachments) return;

    try {
      // Upload any pending files first
      let attachments: { url: string; filename: string }[] = [];
      if (pendingFiles.length > 0) {
        setUploadingAttachments(true);
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
        setUploadingAttachments(false);
      }

      await conversationSend(newMessage, attachments);
      setNewMessage('');
      setPendingFiles([]);
      setUploaderClearKey((k) => k + 1);
    } catch {
      // sendError is surfaced via hook
    } finally {
      setUploadingAttachments(false);
    }
  };

  const getSenderLabel = (msg: ChatMessage): string => {
    if (msg.senderName) return msg.senderName;
    if (msg.senderType === 'foh') return 'Mimo';
    if (msg.senderType === 'client') return 'Client';
    if (msg.senderType === 'professional') return 'Professional';
    return 'Unknown';
  };

  const isCurrentUser = (msg: ChatMessage): boolean => {
    if (currentUserRole === 'admin') return false; // Admin never "owns" messages
    return msg.senderType === currentUserRole;
  };

  return (
    <div className={`min-w-0 max-w-full overflow-x-hidden rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] shadow-sm${fillHeight ? ' flex h-full min-h-0 flex-col' : ''} ${className}`}>
      {/* Header */}
      <div className="border-b border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.88)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{headerTitle}</h3>
            {headerSubtitle.trim() ? (
              <p className="text-xs text-slate-600">{headerSubtitle}</p>
            ) : null}
          </div>
          {showPresenceIndicator ? (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-[rgba(215,107,78,0.95)]" title="Live chat"></div>
              <span className="text-xs font-medium text-[rgba(176,74,46,0.95)]">Active</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className={`min-w-0 space-y-3 overflow-x-hidden overflow-y-auto p-4 ${fillHeight ? 'flex-1 min-h-0' : 'min-h-[300px] max-h-[500px]'}`}>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-600">Loading chat...</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-[rgba(176,74,46,0.95)]">{error}</div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">
            <p>No messages yet.</p>
            <p className="mt-1 text-xs">Start the conversation with your project team!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCurrent = isCurrentUser(msg);
            const isFoh = msg.senderType === 'foh';
            const event = parseChatEvent(msg.content || '');
            
            return (
              <div key={msg.id}>
                {firstUnreadMessageId === msg.id && (
                  <div id={`project-chat-divider-${msg.id}`} className="my-2 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[rgba(215,107,78,0.35)]" />
                    <span className="shrink-0 rounded-full border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.9)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[rgba(176,74,46,0.95)]">
                      New messages
                    </span>
                    <div className="h-px flex-1 bg-[rgba(215,107,78,0.35)]" />
                  </div>
                )}

                <div id={`project-chat-message-${msg.id}`} className={`flex min-w-0 ${isCurrent ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`min-w-0 ${event ? 'max-w-[86%]' : 'max-w-[75%] rounded-lg px-4 py-2 text-sm'} ${
                      event
                        ? ''
                        : isCurrent
                        ? 'bg-[rgba(215,107,78,0.95)] text-white'
                        : isFoh
                        ? 'border border-[rgba(215,107,78,0.25)] bg-[rgba(255,240,232,0.92)] text-slate-800'
                        : 'border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.95)] text-slate-800'
                    }`}
                  >
                    {!isCurrent && (
                      <div className={`mb-1 text-xs font-semibold ${isFoh ? 'text-[rgba(176,74,46,0.95)]' : 'text-slate-600'}`}>
                        {getSenderLabel(msg)}
                      </div>
                    )}

                    {/* Message content */}
                    {msg.content && (event ? <ChatEventCard event={event} isCurrentUser={isCurrent} /> : <div className="whitespace-pre-wrap break-words">{msg.content}</div>)}

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

                    <div className={`mt-1 text-xs ${isCurrent ? 'text-[rgba(255,244,238,0.95)]' : 'text-slate-600'}`}>
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
      <form onSubmit={handleSend} className="border-t border-[rgba(120,53,15,0.14)] p-4">
        {sendError && (
          <div className="mb-2 rounded border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.92)] px-2 py-1 text-xs text-[rgba(176,74,46,0.95)]">
            {sendError}
          </div>
        )}
        
        {/* Image uploader — files are uploaded on send */}
        <div className="mb-3">
          <ChatImageUploader
            onFilesSelected={setPendingFiles}
            maxImages={3}
            disabled={sending || loading || uploadingAttachments}
            isUploading={uploadingAttachments}
            uploadingCount={pendingFiles.length}
            clearKey={uploaderClearKey}
          />
        </div>
        
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={messagePlaceholder}
            disabled={sending || loading || uploadingAttachments}
            className="min-w-0 flex-1 rounded-lg border border-[rgba(120,53,15,0.2)] bg-white px-3 py-2 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[rgba(215,107,78,0.5)] disabled:bg-[rgba(245,238,219,0.8)]"
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && pendingFiles.length === 0) || sending || loading || uploadingAttachments}
            className="w-full shrink-0 rounded-lg bg-[rgba(215,107,78,0.95)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[rgba(176,74,46,0.98)] disabled:cursor-not-allowed disabled:bg-[rgba(120,53,15,0.35)] sm:w-auto"
          >
            {uploadingAttachments
              ? 'Uploading images...'
              : sending
              ? (pendingFiles.length > 0 ? 'Uploading & Sending...' : 'Sending...')
              : sendButtonLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
