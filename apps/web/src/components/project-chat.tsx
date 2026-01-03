'use client';

import { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';

interface ChatMessage {
  id: string;
  senderType: 'client' | 'professional' | 'foh';
  senderName?: string;
  content: string;
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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!newMessage.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newMessage.trim() }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[500px]">
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
                  <div className="whitespace-pre-wrap">{msg.content}</div>
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-slate-200 p-4">
        {error && (
          <div className="mb-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
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
            disabled={!newMessage.trim() || sending || loading}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
