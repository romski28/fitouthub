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
  const [typeFilter, setTypeFilter] = useState<'all' | 'private' | 'anonymous' | 'project'>('all');
  
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
      return thread.userName || thread.professionalName || 'Private Chat';
    } else if (thread.type === 'anonymous') {
      return `Anonymous (${thread.sessionId?.slice(0, 8)})`;
    } else if (thread.type === 'project') {
      return thread.projectName || 'Project Chat';
    }
    return 'Unknown';
  };

  const getThreadSubtext = (thread: ChatThread) => {
    if (thread.type === 'private') {
      return thread.userName ? 'Client Support' : 'Professional Support';
    } else if (thread.type === 'anonymous') {
      return 'Anonymous Support';
    } else if (thread.type === 'project') {
      return 'Project Team Chat';
    }
    return '';
  };

  const getTypeColor = (type: 'private' | 'anonymous' | 'project' | 'assist') => {
    switch (type) {
      case 'private':
        return 'bg-green-100 text-green-800';
      case 'anonymous':
        return 'bg-gray-100 text-gray-800';
      case 'project':
        return 'bg-purple-100 text-purple-800';
      case 'assist':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getTypeEmoji = (type: 'private' | 'anonymous' | 'project' | 'assist') => {
    switch (type) {
      case 'private':
        return '🔒';
      case 'anonymous':
        return '👤';
      case 'project':
        return '🏗️';
      case 'assist':
        return '📋';
      default:
        return '💬';
    }
  };

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
            onClick={() => setTypeFilter('private')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
              typeFilter === 'private'
                ? 'bg-green-600 text-white border-green-700'
                : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
            }`}
          >
            🔒 Private Support
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

      {/* Assist Requests View */}
      {viewMode === 'assist' && (
        <>
          {/* Status Tabs */}
          <div className="flex gap-2">
            {(['open', 'in_progress', 'closed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusTab(status)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold border ${
                  statusTab === status
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {status.replace('_', ' ')}
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            📋 Assist Request
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
                .filter((thread) => typeFilter === 'all' || thread.type === typeFilter)
                .map((thread) => (
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
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(thread.type)}`}
                        >
                          {getTypeEmoji(thread.type)} {thread.type === 'private' ? 'Private' : thread.type === 'anonymous' ? 'Anonymous' : 'Project'}
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
              ))
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
