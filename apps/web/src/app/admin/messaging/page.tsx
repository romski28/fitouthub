"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { API_BASE_URL } from "@/config/api";
import Link from "next/link";

type AssistRequest = {
  id: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; projectName: string; status: string; region: string; clientName: string };
  user?: { id: string; firstName?: string; surname?: string; email?: string } | null;
};

type ChatThread = {
  id: string;
  type: 'private' | 'anonymous' | 'project';
  userId?: string;
  professionalId?: string;
  userName?: string;
  professionalName?: string;
  projectId?: string;
  projectName?: string;
  sessionId?: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage?: string;
  status?: 'open' | 'in_progress' | 'closed' | string;
};

type Message = {
  id: string;
  senderType: string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
};

export default function AdminMessagingPage() {
  const { accessToken } = useAuth();
  const [viewMode, setViewMode] = useState<'assist' | 'general' | 'all'>('all');
  const [statusTab, setStatusTab] = useState<"open" | "in_progress" | "closed">("open");
  const [typeFilter, setTypeFilter] = useState<'all' | 'support' | 'supplier-client' | 'anonymous' | 'project'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'closed'>('all');
  
  // Assist requests state
  const [requests, setRequests] = useState<AssistRequest[]>([]);
  const [assistTotal, setAssistTotal] = useState<number>(0);
  const [assistLoading, setAssistLoading] = useState(false);
  
  // General chat threads state
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  // Active thread/request state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'assist' | 'private' | 'anonymous' | 'project' | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState<string>("");
  const [msgSubmitting, setMsgSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch assist requests
  const fetchAssistRequests = async () => {
    setAssistLoading(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/assist-requests?status=${statusTab}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRequests(data.items || []);
      setAssistTotal(Number(data.total || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch assist requests");
    } finally {
      setAssistLoading(false);
    }
  };

  // Fetch general chat threads
  const fetchChatThreads = async () => {
    if (!accessToken) return;
    setThreadsLoading(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/chat/admin/inbox`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch chat threads");
    } finally {
      setThreadsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'assist' || viewMode === 'all') {
      fetchAssistRequests();
    }
    if (viewMode === 'general' || viewMode === 'all') {
      fetchChatThreads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, statusTab]);

  // Open assist request thread
  const openAssistThread = async (id: string) => {
    if (!accessToken) return;
    setActiveId(id);
    setActiveType('assist');
    setMsgText("");
    setMessages([]);
    setMsgLoading(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/assist-requests/${encodeURIComponent(id)}/messages?limit=200`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setMsgLoading(false);
    }
  };

  // Open general chat thread
  const openChatThread = async (thread: ChatThread) => {
    if (!accessToken) return;
    setActiveId(thread.id);
    setActiveType(thread.type);
    setMsgText("");
    setMessages([]);
    setMsgLoading(true);
    try {
      let url = '';
      if (thread.type === 'private') {
        url = `${API_BASE_URL.replace(/\/$/, "")}/chat/private/${encodeURIComponent(thread.id)}`;
      } else if (thread.type === 'anonymous') {
        url = `${API_BASE_URL.replace(/\/$/, "")}/chat/anonymous/${encodeURIComponent(thread.id)}`;
      } else if (thread.type === 'project') {
        url = `${API_BASE_URL.replace(/\/$/, "")}/chat/projects/${encodeURIComponent(thread.projectId!)}/thread`;
      }
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setMsgLoading(false);
    }
  };

  // Send message to assist request
  const sendAssistMessage = async () => {
    if (!activeId || !msgText.trim() || !accessToken) return;
    setMsgSubmitting(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/assist-requests/${encodeURIComponent(activeId)}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sender: "foh", content: msgText.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsgText("");
      await openAssistThread(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMsgSubmitting(false);
    }
  };

  // Send message to general chat thread
  const sendChatMessage = async () => {
    if (!activeId || !msgText.trim() || !activeType || !accessToken) return;
    setMsgSubmitting(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/chat/admin/threads/${encodeURIComponent(activeId)}/reply`;
      const res = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content: msgText.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsgText("");
      
      // Reload messages
      const thread = threads.find(t => t.id === activeId);
      if (thread) {
        await openChatThread(thread);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMsgSubmitting(false);
    }
  };

  const sendMessage = activeType === 'assist' ? sendAssistMessage : sendChatMessage;

  const getThreadLabel = (thread: ChatThread) => {
    if (thread.type === 'private') {
      // Distinguish between support requests and professional chats
      if (thread.userId) {
        return thread.userName || 'Support Request';
      } else {
        return thread.professionalName || 'Professional Chat';
      }
    } else if (thread.type === 'anonymous') {
      return `Anonymous (${thread.sessionId?.slice(0, 8)})`;
    } else if (thread.type === 'project') {
      return thread.projectName || 'Project Chat';
    }
    return 'Unknown';
  };

  const getThreadSubtext = (thread: ChatThread) => {
    if (thread.type === 'private') {
      if (thread.userId) {
        return 'User Support';
      } else {
        return 'Client-Professional';
      }
    } else if (thread.type === 'anonymous') {
      return 'Anonymous Support';
    } else if (thread.type === 'project') {
      return 'Project Team Chat';
    }
    return '';
  };

  const getChatMessageType = (thread: ChatThread): string => {
    if (thread.type === 'private') {
      return thread.userId ? 'support' : 'supplier-client';
    }
    return thread.type;
  };

  const getTypeColor = (type: 'private' | 'anonymous' | 'project' | 'assist' | string) => {
    if (type === 'assist') {
      return 'bg-emerald-100 text-emerald-800';
    } else if (type === 'support') {
      return 'bg-blue-100 text-blue-800';
    } else if (type === 'supplier-client') {
      return 'bg-indigo-100 text-indigo-800';
    } else if (type === 'anonymous') {
      return 'bg-gray-100 text-gray-800';
    } else if (type === 'project') {
      return 'bg-purple-100 text-purple-800';
    }
    return 'bg-slate-100 text-slate-800';
  };

  const getTypeEmoji = (type: 'private' | 'anonymous' | 'project' | 'assist' | string) => {
    if (type === 'assist') {
      return '📋';
    } else if (type === 'support') {
      return '🆘';
    } else if (type === 'supplier-client') {
      return '🤝';
    } else if (type === 'anonymous') {
      return '👤';
    } else if (type === 'project') {
      return '🏗️';
    }
    return '💬';
  };

  const getTypeLabel = (type: 'private' | 'anonymous' | 'project' | 'assist' | string) => {
    if (type === 'assist') {
      return 'Assist Request';
    } else if (type === 'support') {
      return 'Support Request';
    } else if (type === 'supplier-client') {
      return 'Supplier/Client';
    } else if (type === 'anonymous') {
      return 'Anonymous';
    } else if (type === 'project') {
      return 'Project';
    }
    return 'Unknown';
  };

  const statusEligible = (msgType: string) => ['support', 'supplier-client', 'anonymous'].includes(msgType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
          <h1 className="text-2xl font-bold">Messaging & Support</h1>
          <p className="text-sm text-slate-200/90">
            Manage assist requests and respond to user support messages
          </p>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setViewMode('all')}
          className={`rounded-md px-4 py-2 text-sm font-semibold border transition ${
            viewMode === 'all'
              ? 'bg-slate-900 text-white border-slate-950'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          🔔 All Messages
        </button>
        <button
          onClick={() => setViewMode('assist')}
          className={`rounded-md px-4 py-2 text-sm font-semibold border transition ${
            viewMode === 'assist'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          📋 Assist Requests
        </button>
        <button
          onClick={() => setViewMode('general')}
          className={`rounded-md px-4 py-2 text-sm font-semibold border transition ${
            viewMode === 'general'
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          💬 Support Chat
        </button>
      </div>

      {/* Message Type Filters (for chat view) */}
      {(viewMode === 'general' || viewMode === 'all') && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-950'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => setTypeFilter('support')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              typeFilter === 'support'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
            }`}
          >
            🆘 Support Requests
          </button>
          <button
            onClick={() => setTypeFilter('supplier-client')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              typeFilter === 'supplier-client'
                ? 'bg-indigo-600 text-white border-indigo-700'
                : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            🤝 Supplier/Client
          </button>
          <button
            onClick={() => setTypeFilter('anonymous')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              typeFilter === 'anonymous'
                ? 'bg-gray-600 text-white border-gray-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            👤 Anonymous
          </button>
          <button
            onClick={() => setTypeFilter('project')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              typeFilter === 'project'
                ? 'bg-purple-600 text-white border-purple-700'
                : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'
            }`}
          >
            🏗️ Project Chat
          </button>
        </div>
      )}

      {/* Status Filters for support / anonymous / professional-client */}
      {(viewMode === 'general' || viewMode === 'all') && (typeFilter === 'all' || typeFilter === 'support' || typeFilter === 'supplier-client' || typeFilter === 'anonymous') && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-950'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            All Statuses
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              statusFilter === 'open'
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
            }`}
          >
            📖 Open
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              statusFilter === 'in_progress'
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            ⏳ In Progress
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              statusFilter === 'closed'
                ? 'bg-slate-700 text-white border-slate-800'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            ✅ Closed
          </button>
        </div>
      )}

      {/* Assist Requests View */}
      {(viewMode === 'assist' || viewMode === 'all') && (
        <>
          {/* Status Tabs for Assist Requests */}
          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-slate-600">Assist Request Status:</span>
            {(['open', 'in_progress', 'closed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusTab(status)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold border transition ${
                  statusTab === status
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {status === 'open' ? '📖 Open' : status === 'in_progress' ? '⏳ In Progress' : '✅ Closed'}
              </button>
            ))}
            <div className="ml-auto text-sm text-slate-600">
              {assistTotal} {statusTab.replace('_', ' ')} requests
            </div>
          </div>

          {/* Assist Requests List */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {assistLoading ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  Loading...
                </div>
              ) : requests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  No {statusTab.replace('_', ' ')} requests.
                </div>
              ) : (
                requests.map((req) => (
                  <div
                    key={req.id}
                    className={`rounded-lg border ${
                      activeId === req.id && activeType === 'assist'
                        ? 'border-emerald-300 ring-2 ring-emerald-100'
                        : 'border-slate-200'
                    } bg-white p-4 shadow-sm cursor-pointer hover:border-slate-300 transition`}
                    onClick={() => openAssistThread(req.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor('assist')}`}>
                            {getTypeEmoji('assist')} {getTypeLabel('assist')}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {req.project.projectName}
                        </div>
                        <div className="text-xs text-slate-600">
                          {req.project.region} • {req.project.clientName}
                        </div>
                        {req.notes && (
                          <p className="mt-1 text-xs text-slate-700 line-clamp-2">{req.notes}</p>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          {new Date(req.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="inline-block rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {req.status.replace('_', ' ')}
                        </span>
                        <div className="mt-2">
                          <Link
                            href={`/projects/${req.project.id}`}
                            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open project
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Messages Panel */}
            {activeId && activeType === 'assist' && (
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col h-[600px]">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Messages</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {msgLoading ? (
                    <div className="text-center text-slate-500 text-sm">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm">No messages yet.</div>
                  ) : (
                    messages.map((msg) => {
                      const isFoh = msg.senderType === 'foh';
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isFoh ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              isFoh
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-900'
                            }`}
                          >
                            {!isFoh && (
                              <div className="text-xs font-semibold mb-1 text-slate-600">
                                Client
                              </div>
                            )}
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 flex gap-2 overflow-x-auto">
                                {msg.attachments.map((att, i) => (
                                  <a
                                    key={i}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block flex-shrink-0 bg-white p-1 rounded"
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.filename}
                                      className="w-16 h-16 min-w-[64px] rounded border border-slate-200 hover:opacity-80 transition object-cover"
                                      title={att.filename}
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                            <div
                              className={`text-xs mt-1 ${
                                isFoh ? 'text-emerald-100' : 'text-slate-500'
                              }`}
                            >
                              {new Date(msg.createdAt).toLocaleString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: '2-digit',
                                month: 'short',
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="p-4 border-t border-slate-200">
                  {error && (
                    <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !msgSubmitting && sendMessage()}
                      placeholder="Type a message..."
                      disabled={msgSubmitting}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!msgText.trim() || msgSubmitting}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      {msgSubmitting ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* General Chat Threads View */}
      {viewMode === 'general' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            {threadsLoading ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Loading...
              </div>
            ) : threads.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                No support threads yet.
              </div>
            ) : (
              threads
                .filter((thread) => {
                  const msgType = getChatMessageType(thread);
                  if (typeFilter !== 'all' && msgType !== typeFilter) return false;
                  if (statusFilter !== 'all' && statusEligible(msgType)) {
                    const statusValue = thread.status || 'open';
                    return statusValue === statusFilter;
                  }
                  return true;
                })
                .map((thread) => {
                  const msgType = getChatMessageType(thread);
                  return (
                    <div
                      key={thread.id}
                      className={`rounded-lg border ${
                        activeId === thread.id && activeType === thread.type
                          ? 'border-blue-300 ring-2 ring-blue-100'
                          : 'border-slate-200'
                      } bg-white p-4 shadow-sm cursor-pointer hover:border-slate-300 transition`}
                      onClick={() => openChatThread(thread)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(msgType)}`}
                            >
                              {getTypeEmoji(msgType)} {getTypeLabel(msgType)}
                            </span>
                            {thread.unreadCount > 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                {thread.unreadCount} unread
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-slate-900">
                            {getThreadLabel(thread)}
                          </div>
                          <div className="text-xs text-slate-600">{getThreadSubtext(thread)}</div>
                          {thread.lastMessage && (
                            <p className="mt-1 text-xs text-slate-700 line-clamp-2">
                              {thread.lastMessage}
                            </p>
                          )}
                          <div className="mt-1 text-xs text-slate-500">
                            Last updated: {new Date(thread.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Messages Panel for General Chat */}
          {activeId && activeType !== 'assist' && (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col h-[600px]">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Messages</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading ? (
                  <div className="text-center text-slate-500 text-sm">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm">No messages yet.</div>
                ) : (
                  messages.map((msg) => {
                    const isFoh = msg.senderType === 'foh';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isFoh ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            isFoh
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          {!isFoh && (
                            <div className="text-xs font-semibold mb-1 text-slate-600">
                              {msg.senderType === 'professional' ? 'Professional' : msg.senderType === 'client' ? 'Client' : 'User'}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 flex gap-2 overflow-x-auto">
                              {msg.attachments.map((att, i) => (
                                <a
                                  key={i}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block flex-shrink-0 bg-white p-1 rounded"
                                >
                                  <img
                                    src={att.url}
                                    alt={att.filename}
                                    className="w-16 h-16 min-w-[64px] rounded border border-slate-200 hover:opacity-80 transition object-cover"
                                    title={att.filename}
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          <div
                            className={`text-xs mt-1 ${
                              isFoh ? 'text-blue-100' : 'text-slate-500'
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: 'short',
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-4 border-t border-slate-200">
                {error && (
                  <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !msgSubmitting && sendMessage()}
                    placeholder="Type a message..."
                    disabled={msgSubmitting}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!msgText.trim() || msgSubmitting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {msgSubmitting ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
