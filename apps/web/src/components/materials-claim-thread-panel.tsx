'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import ChatImageAttachment from './chat-image-attachment';

interface ClaimChatMessage {
  id: string;
  senderType: 'client' | 'professional' | 'foh';
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
}

interface MaterialsClaimThreadPanelProps {
  projectId: string;
  accessToken: string;
  claimId: string;
  role: 'client' | 'professional' | 'admin';
  title?: string;
  subtitle?: string;
  placeholder?: string;
  sendLabel?: string;
  className?: string;
  onMessagesChange?: (messages: ClaimChatMessage[]) => void;
}

export default function MaterialsClaimThreadPanel({
  projectId,
  accessToken,
  claimId,
  role,
  title = 'Claim Questions',
  subtitle = 'Messages in this thread are scoped to this claim only.',
  placeholder = 'Type your question...',
  sendLabel = 'Ask Question',
  className = '',
  onMessagesChange,
}: MaterialsClaimThreadPanelProps) {
  const [messages, setMessages] = useState<ClaimChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const url = new URL(`${API_BASE_URL}/projects/${projectId}/chat`);
      url.searchParams.set('threadScope', 'claim');
      url.searchParams.set('threadScopeId', claimId);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new Error('Failed to load claim messages');
      }

      const data = await res.json();
      const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(nextMessages);
      onMessagesChange?.(nextMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claim messages');
      setMessages([]);
      onMessagesChange?.([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, accessToken, claimId, onMessagesChange]);

  useEffect(() => {
    if (!projectId || !accessToken || !claimId) return;
    void loadMessages();
  }, [projectId, accessToken, claimId, loadMessages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!draft.trim() || sending) return;

    try {
      setSending(true);
      setError(null);

      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: draft.trim(),
          threadScope: 'claim',
          threadScopeId: claimId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to send message');
      }

      const data = await res.json();
      const message = data?.message;
      if (message) {
        setMessages((prev) => {
          const next = [...prev, message];
          onMessagesChange?.(next);
          return next;
        });
      }
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const isMine = (senderType: string) => {
    if (role === 'admin') return senderType === 'foh';
    return senderType === role;
  };

  return (
    <div className={`rounded-md border border-slate-700 bg-slate-900/60 ${className}`}>
      <div className="border-b border-slate-700 px-3 py-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-slate-300">{subtitle}</p>
      </div>

      <div ref={containerRef} className="max-h-64 overflow-y-auto space-y-2 p-3">
        {loading ? (
          <p className="text-xs text-slate-400">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate-400">No messages in this claim thread yet.</p>
        ) : (
          messages.map((message) => {
            const mine = isMine(message.senderType);
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-md px-3 py-2 text-xs ${mine ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'}`}>
                  {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.attachments.map((attachment, index) => (
                        <ChatImageAttachment key={`${message.id}-${index}`} url={attachment.url} filename={attachment.filename} />
                      ))}
                    </div>
                  )}
                  <p className={`mt-1 text-[10px] ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleString('en-HK')}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-700 p-3">
        {error && (
          <p className="mb-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">{error}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={placeholder}
            className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !draft.trim()}
            className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
