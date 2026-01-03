'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';

interface ChatMessage {
  id: string;
  senderType: 'user' | 'foh' | 'client' | 'professional';
  content: string;
  createdAt: string;
}

export default function FloatingChat() {
  const pathname = usePathname();
  const { isLoggedIn: clientLoggedIn, accessToken: clientToken } = useAuth();
  const { isLoggedIn: proLoggedIn, accessToken: proToken } = useProfessionalAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isAdminPage = pathname?.startsWith('/admin');
  const isLoggedIn = clientLoggedIn || proLoggedIn;
  const accessToken = clientToken || proToken;
  const userRole = clientLoggedIn ? 'client' : proLoggedIn ? 'professional' : 'anonymous';

  // Close chat on logout
  useEffect(() => {
    if (!isLoggedIn && isOpen) {
      setIsOpen(false);
      setThreadId(null);
      setMessages([]);
    }
  }, [isLoggedIn, isOpen]);

  // Load or create thread
  useEffect(() => {
    const loadThread = async () => {
      setLoading(true);
      try {
        if (isLoggedIn && accessToken) {
          console.log('[FloatingChat] Loading logged-in user thread...');
          // Try to fetch or create user's private FOH thread
          try {
            const res = await fetch(`${API_BASE_URL}/chat/private`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (res.ok) {
              const data = await res.json();
              console.log('[FloatingChat] Fetched thread:', data);
              setThreadId(data.threadId || data.id);
              setMessages(data.messages || []);
              setUnreadCount(data.unreadCount || 0);
              return;
            } else if (res.status === 404) {
              console.log('[FloatingChat] Thread not found, creating new one...');
              // Try to create new thread
              const createRes = await fetch(`${API_BASE_URL}/chat/private`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              });
              if (createRes.ok) {
                const data = await createRes.json();
                console.log('[FloatingChat] Created new thread:', data);
                setThreadId(data.threadId || data.id);
                setMessages([]);
                return;
              }
            }
          } catch (e) {
            console.warn('[FloatingChat] Private chat endpoint error:', e);
          }
          // Fallback: use a stub thread ID based on user
          const stubId = `stub-${userRole}`;
          console.log('[FloatingChat] Using fallback stub threadId:', stubId);
          setThreadId(stubId);
          setMessages([]);
        } else {
          console.log('[FloatingChat] Loading anonymous user thread...');
          // Anonymous user - use local storage
          let anonId = localStorage.getItem('foh_anon_thread');
          if (!anonId) {
            // Try to create anonymous thread
            try {
              const res = await fetch(`${API_BASE_URL}/chat/anonymous`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
              if (res.ok) {
                const data = await res.json();
                anonId = data.threadId || data.id;
                if (anonId) {
                  localStorage.setItem('foh_anon_thread', anonId);
                  console.log('[FloatingChat] Created anonymous thread:', anonId);
                }
              }
            } catch (e) {
              console.warn('[FloatingChat] Anonymous chat endpoint error:', e);
              anonId = `stub-anon-${Date.now()}`;
              localStorage.setItem('foh_anon_thread', anonId);
              console.log('[FloatingChat] Using fallback stub anonymous threadId:', anonId);
            }
          }
          if (anonId) {
            console.log('[FloatingChat] Setting anonymous threadId:', anonId);
            setThreadId(anonId);
            // Try to fetch messages
            try {
              const res = await fetch(`${API_BASE_URL}/chat/anonymous/${anonId}`);
              if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
              }
            } catch (e) {
              console.warn('[FloatingChat] Could not fetch anon messages:', e);
            }
          }
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
  }, [isOpen, isLoggedIn, accessToken, userRole, threadId]);

  // Mark as read when opened
  useEffect(() => {
    if (isOpen && threadId && isLoggedIn && accessToken && unreadCount > 0) {
      fetch(`${API_BASE_URL}/chat/private/${threadId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(() => setUnreadCount(0));
    }
  }, [isOpen, threadId, isLoggedIn, accessToken, unreadCount]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !threadId || sending) return;

    setSending(true);
    try {
      // For stub threads, just add message locally
      if (threadId.startsWith('stub-')) {
        console.log('[FloatingChat] Sending to stub thread:', threadId);
        setMessages((prev) => [...prev, {
          id: Date.now().toString(),
          senderType: userRole === 'professional' ? 'professional' : userRole === 'client' ? 'user' : 'anonymous',
          content: message.trim(),
          createdAt: new Date().toISOString(),
        }]);
        setMessage('');
        return;
      }

      const endpoint = isLoggedIn && accessToken
        ? `${API_BASE_URL}/chat/private/${threadId}/messages`
        : `${API_BASE_URL}/chat/anonymous/${threadId}/messages`;
      
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      console.log('[FloatingChat] Sending message to endpoint:', endpoint, 'Thread:', threadId, 'User role:', userRole);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: message.trim() }),
      });

      console.log('[FloatingChat] Response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[FloatingChat] Message sent successfully:', data);
        setMessages((prev) => [...prev, data.message || {
          id: Date.now().toString(),
          senderType: userRole === 'professional' ? 'professional' : userRole === 'client' ? 'user' : 'anonymous',
          content: message.trim(),
          createdAt: new Date().toISOString(),
        }]);
        setMessage('');
      } else {
        const errorText = await res.text();
        console.error('[FloatingChat] Failed to send message:', res.status, errorText);
      }
    } catch (error) {
      console.error('[FloatingChat] Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  // Don't show on admin pages
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
              <p className="text-xs text-blue-100">{isLoggedIn ? 'Private support chat' : 'Anonymous chat'}</p>
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
                      <div className="whitespace-pre-wrap">{msg.content}</div>
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
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                disabled={sending || loading || !threadId}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={!message.trim() || sending || loading || !threadId}
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
          className="fixed top-1/2 right-6 -translate-y-1/2 z-50 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200 flex items-center justify-center group"
          aria-label="Open chat"
          title="Chat with Fitout Hub support"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
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
    </>
  );
}
