'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import Link from 'next/link';

interface Message {
  id: string;
  content: string;
  senderType: 'user' | 'professional' | 'anonymous' | 'foh';
  senderName?: string;
  createdAt: string;
}

interface ThreadDetail {
  id: string;
  type: 'private' | 'anonymous' | 'project';
  userName?: string;
  professionalName?: string;
  projectName?: string;
  sessionId?: string;
  messages: Message[];
  updatedAt: string;
}

export default function FohInboxDetailPage() {
  const params = useParams();
  const threadId = params.id as string;
  const { accessToken } = useAuth();
  
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadThread = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/chat/admin/threads/${threadId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setThread(data);
      } else if (response.status === 404) {
        setError('Thread not found');
      } else {
        setError(`Failed to load thread: ${response.status}`);
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
      setError('Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [threadId, accessToken]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || sending || !thread) return;

    setSending(true);
    try {
      const endpoint = `${API_BASE_URL}/chat/admin/threads/${threadId}/reply`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: replyMessage,
        }),
      });

      if (response.ok) {
        setReplyMessage('');
        await loadThread();
      } else {
        setError('Failed to send reply');
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
      setError('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading thread...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!thread || error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <Link
            href="/admin/foh-inbox"
            className="text-blue-600 hover:text-blue-700 mb-6 inline-block"
          >
            ← Back to Inbox
          </Link>
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {error || 'Thread not found'}
            </h2>
            <p className="text-gray-600">
              The requested support thread could not be found.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const threadName =
    thread.userName ||
    thread.professionalName ||
    thread.projectName ||
    `Anonymous ${thread.sessionId?.slice(0, 8)}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/foh-inbox"
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Back to Inbox
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{threadName}</h1>
          <p className="text-gray-600 text-sm">
            {thread.type === 'private'
              ? 'Private Support Chat'
              : thread.type === 'anonymous'
              ? 'Anonymous Support Chat'
              : 'Project Team Chat'}
          </p>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
            {thread.messages.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No messages yet</p>
            ) : (
              thread.messages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      msg.senderType === 'foh'
                        ? 'bg-blue-600'
                        : msg.senderType === 'professional'
                        ? 'bg-green-600'
                        : msg.senderType === 'user'
                        ? 'bg-purple-600'
                        : 'bg-gray-400'
                    }`}
                  >
                    {msg.senderType === 'foh'
                      ? 'FOH'
                      : msg.senderType === 'professional'
                      ? 'Pro'
                      : msg.senderType === 'user'
                      ? 'U'
                      : 'A'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {msg.senderName ||
                          (msg.senderType === 'foh'
                            ? 'FOH Team'
                            : msg.senderType === 'professional'
                            ? 'Professional'
                            : msg.senderType === 'user'
                            ? 'User'
                            : 'Anonymous')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 break-words">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Reply Form */}
          <form onSubmit={handleReply} className="border-t pt-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type a reply..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !replyMessage.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {sending ? 'Sending...' : 'Reply'}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
