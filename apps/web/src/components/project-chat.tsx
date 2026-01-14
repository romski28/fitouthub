'use client';

import { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import ChatImageAttachment from './chat-image-attachment';
import ChatImageUploader from './chat-image-uploader';

interface ChatMessage {
  id: string;
  senderType: 'client' | 'professional' | 'foh';
  senderName?: string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
}

interface ProjectChatProps {
  projectId: string;
  accessToken: string;
  currentUserRole: 'client' | 'professional' | 'admin';
  className?: string;
}

export default function ProjectChat({ projectId, accessToken, currentUserRole, className = '' }: ProjectChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; filename: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
        const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat`, {
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
        setMessages(data.messages || []);
        
        // Mark as read
        await fetch(`${API_BASE_URL}/projects/${projectId}/chat/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
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
  }, [projectId, accessToken]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && pendingAttachments.length === 0) || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content: newMessage.trim(),
          attachments: pendingAttachments,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
      setPendingAttachments([]);
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
    <div className={`flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-emerald-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-emerald-900">Project Team Chat</h3>
            <p className="text-xs text-emerald-700">Client, awarded professionals & Fitout Hub</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live chat"></div>
            <span className="text-xs text-emerald-700 font-medium">Active</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[500px]">
        {loading ? (
          <div className="text-center text-slate-500 text-sm py-8">Loading chat...</div>
        ) : error ? (
          <div className="text-center text-rose-600 text-sm py-8">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <p>No messages yet.</p>
            <p className="mt-1 text-xs">Start the conversation with your project team!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCurrent = isCurrentUser(msg);
            const isFoh = msg.senderType === 'foh';
            
            return (
              <div key={msg.id} className={`flex ${isCurrent ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    isCurrent
                      ? 'bg-blue-600 text-white'
                      : isFoh
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  {!isCurrent && (
                    <div className={`text-xs font-semibold mb-1 ${isFoh ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {getSenderLabel(msg)}
                    </div>
                  )}
                  
                  {/* Message content */}
                  {msg.content && (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                  
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
                  
                  <div className={`text-xs mt-1 ${isCurrent ? 'text-blue-100' : 'text-slate-500'}`}>
                    {new Date(msg.createdAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
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
        {error && (
          <div className="mb-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
          </div>
        )}
        
        {/* Image uploader */}
        <div className="mb-3">
          <ChatImageUploader
            onImagesUploaded={(images) => setPendingAttachments((prev) => [...prev, ...images])}
            maxImages={3}
            disabled={sending || loading}
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
        
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message to the project team..."
            disabled={sending || loading}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && pendingAttachments.length === 0) || sending || loading}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
