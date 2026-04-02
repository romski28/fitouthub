"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { API_BASE_URL } from "@/config/api";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AssistRequest = {
  id: string;
  status: string;
  category?: string;
  raisedBy?: string;
  professionalId?: string | null;
  contactMethod?: 'chat' | 'call' | 'whatsapp' | string;
  requestedCallAt?: string | null;
  requestedCallTimezone?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  case?: {
    id: string;
    caseNumber: string;
    category?: string;
    status: string;
    raisedBy?: string;
    slaDeadline?: string | null;
    firstRepliedAt?: string | null;
    slaBreachedAt?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
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
  lastMessageContext?: {
    pageType?: 'project_creation' | 'project_view' | 'general';
    pathname?: string;
    projectId?: string | null;
    projectName?: string | null;
  };
  status?: 'open' | 'in_progress' | 'closed' | string;
};

type Message = {
  id: string;
  senderType: string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
};

type ConversationItem = {
  id: string;
  sourceType: 'support' | 'assist' | 'private' | 'project';
  sourceId: string;
  channel: 'support_whatsapp' | 'support_callback' | 'assist' | 'private_chat' | 'project_chat';
  status: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  initiatedBy: 'client' | 'professional' | 'foh' | 'anonymous' | 'unknown';
  startedAt: string;
  latestAt: string;
  initialMessage: string;
  mediaCount: number;
  projectId?: string;
  projectName?: string;
  openThreadType: 'assist' | 'private' | 'project' | 'support';
  openThreadId: string;
};

export default function AdminMessagingPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialView = (() => {
    const value = searchParams.get('view');
    if (value === 'assist' || value === 'general' || value === 'all' || value === 'conversations' || value === 'cases') return value;
    return 'all';
  })();
  const initialAssistStatus = (() => {
    const value = searchParams.get('assistStatus');
    if (value === 'open' || value === 'in_progress' || value === 'closure_pending' || value === 'closed') return value;
    return 'open';
  })();
  const initialType = (() => {
    const value = searchParams.get('type');
    if (value === 'all' || value === 'support' || value === 'supplier-client' || value === 'anonymous' || value === 'project') return value;
    return 'all';
  })();
  const initialStatus = (() => {
    const value = searchParams.get('status');
    if (value === 'all' || value === 'open' || value === 'in_progress' || value === 'closure_pending' || value === 'closed') return value;
    return 'all';
  })();
  const initialConversationChannel = (() => {
    const value = searchParams.get('channel');
    if (
      value === 'all' ||
      value === 'private_chat' ||
      value === 'project_chat' ||
      value === 'assist' ||
      value === 'support_whatsapp' ||
      value === 'support_callback'
    ) {
      return value;
    }
    return 'all';
  })();
  const initialConversationStatus = (() => {
    const value = searchParams.get('conversationStatus');
    if (
      value === 'all' ||
      value === 'open' ||
      value === 'in_progress' ||
      value === 'closure_pending' ||
      value === 'closed' ||
      value === 'resolved' ||
      value === 'active' ||
      value === 'unassigned' ||
      value === 'claimed'
    ) {
      return value;
    }
    return 'all';
  })();
  const initialClientId = searchParams.get('clientId') || '';

  const [viewMode, setViewMode] = useState<'assist' | 'general' | 'all' | 'conversations' | 'cases'>(initialView);
  const [statusTab, setStatusTab] = useState<"open" | "in_progress" | "closure_pending" | "closed">(initialAssistStatus);
  const [typeFilter, setTypeFilter] = useState<'all' | 'support' | 'supplier-client' | 'anonymous' | 'project'>(initialType);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'closure_pending' | 'closed'>(initialStatus);
  const [conversationChannel, setConversationChannel] = useState<'all' | 'private_chat' | 'project_chat' | 'assist' | 'support_whatsapp' | 'support_callback'>(initialConversationChannel);
  const [conversationStatus, setConversationStatus] = useState<'all' | 'open' | 'in_progress' | 'closure_pending' | 'closed' | 'resolved' | 'active' | 'unassigned' | 'claimed'>(initialConversationStatus);
  const [conversationClientId, setConversationClientId] = useState<string>(initialClientId);
  
  // Assist requests state
  const [requests, setRequests] = useState<AssistRequest[]>([]);
  const [assistTotal, setAssistTotal] = useState<number>(0);
  const [assistLoading, setAssistLoading] = useState(false);
  
  // General chat threads state
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);

  // Active thread/request state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'assist' | 'private' | 'anonymous' | 'project' | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState<string>("");
  const [msgSubmitting, setMsgSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminMessagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (msgLoading) return;
    if (!adminMessagesContainerRef.current) return;
    const node = adminMessagesContainerRef.current;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages.length, activeId, activeType, msgLoading]);

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

  const fetchConversations = async () => {
    if (!accessToken) return;
    setConversationsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (conversationChannel !== 'all') params.set('channel', conversationChannel);
      if (conversationStatus !== 'all') params.set('status', conversationStatus);
      if (conversationClientId.trim()) params.set('clientId', conversationClientId.trim());

      const url = `${API_BASE_URL.replace(/\/$/, "")}/updates/admin-conversations?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setConversations(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setConversationsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'assist' || viewMode === 'all') {
      fetchAssistRequests();
    }
    if (viewMode === 'cases') {
      fetchAssistRequests();
    }
    if (viewMode === 'general' || viewMode === 'all') {
      fetchChatThreads();
    }
    if (viewMode === 'conversations') {
      fetchConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, statusTab, conversationChannel, conversationStatus, conversationClientId]);

  useEffect(() => {
    if (viewMode !== 'cases') return;
    const interval = window.setInterval(() => {
      fetchAssistRequests();
    }, 30000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, statusTab]);

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'assist' || view === 'general' || view === 'all' || view === 'conversations' || view === 'cases') {
      setViewMode(view);
    }

    const assistStatus = searchParams.get('assistStatus');
    if (assistStatus === 'open' || assistStatus === 'in_progress' || assistStatus === 'closure_pending' || assistStatus === 'closed') {
      setStatusTab(assistStatus);
    }

    const type = searchParams.get('type');
    if (type === 'all' || type === 'support' || type === 'supplier-client' || type === 'anonymous' || type === 'project') {
      setTypeFilter(type);
    }

    const status = searchParams.get('status');
    if (status === 'all' || status === 'open' || status === 'in_progress' || status === 'closure_pending' || status === 'closed') {
      setStatusFilter(status);
    }

    const channel = searchParams.get('channel');
    if (
      channel === 'all' ||
      channel === 'private_chat' ||
      channel === 'project_chat' ||
      channel === 'assist' ||
      channel === 'support_whatsapp' ||
      channel === 'support_callback'
    ) {
      setConversationChannel(channel);
    }

    const conversationStatusParam = searchParams.get('conversationStatus');
    if (
      conversationStatusParam === 'all' ||
      conversationStatusParam === 'open' ||
      conversationStatusParam === 'in_progress' ||
      conversationStatusParam === 'closure_pending' ||
      conversationStatusParam === 'closed' ||
      conversationStatusParam === 'resolved' ||
      conversationStatusParam === 'active' ||
      conversationStatusParam === 'unassigned' ||
      conversationStatusParam === 'claimed'
    ) {
      setConversationStatus(conversationStatusParam);
    }

    setConversationClientId(searchParams.get('clientId') || '');
  }, [searchParams]);

  const updateQuery = (updates: {
    view?: 'assist' | 'general' | 'all' | 'conversations' | 'cases';
    assistStatus?: 'open' | 'in_progress' | 'closure_pending' | 'closed';
    type?: 'all' | 'support' | 'supplier-client' | 'anonymous' | 'project';
    status?: 'all' | 'open' | 'in_progress' | 'closure_pending' | 'closed';
    channel?: 'all' | 'private_chat' | 'project_chat' | 'assist' | 'support_whatsapp' | 'support_callback';
    conversationStatus?: 'all' | 'open' | 'in_progress' | 'closure_pending' | 'closed' | 'resolved' | 'active' | 'unassigned' | 'claimed';
    clientId?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.view !== undefined) params.set('view', updates.view);
    if (updates.assistStatus !== undefined) params.set('assistStatus', updates.assistStatus);
    if (updates.type !== undefined) params.set('type', updates.type);
    if (updates.status !== undefined) params.set('status', updates.status);
    if (updates.channel !== undefined) params.set('channel', updates.channel);
    if (updates.conversationStatus !== undefined) params.set('conversationStatus', updates.conversationStatus);
    if (updates.clientId !== undefined) {
      if (updates.clientId.trim()) params.set('clientId', updates.clientId.trim());
      else params.delete('clientId');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handleViewModeChange = (mode: 'assist' | 'general' | 'all' | 'conversations') => {
    setViewMode(mode);
    updateQuery({ view: mode });
  };

  const handleCaseViewModeChange = (mode: 'assist' | 'general' | 'all' | 'conversations' | 'cases') => {
    setViewMode(mode);
    updateQuery({ view: mode });
  };

  const handleAssistStatusChange = (status: 'open' | 'in_progress' | 'closure_pending' | 'closed') => {
    setStatusTab(status);
    updateQuery({ assistStatus: status });
  };

  const handleTypeFilterChange = (type: 'all' | 'support' | 'supplier-client' | 'anonymous' | 'project') => {
    setTypeFilter(type);
    updateQuery({ type });
  };

  const handleStatusFilterChange = (status: 'all' | 'open' | 'in_progress' | 'closure_pending' | 'closed') => {
    setStatusFilter(status);
    updateQuery({ status });
  };

  const handleConversationChannelChange = (channel: 'all' | 'private_chat' | 'project_chat' | 'assist' | 'support_whatsapp' | 'support_callback') => {
    setConversationChannel(channel);
    updateQuery({ channel });
  };

  const handleConversationStatusChange = (status: 'all' | 'open' | 'in_progress' | 'closure_pending' | 'closed' | 'resolved' | 'active' | 'unassigned' | 'claimed') => {
    setConversationStatus(status);
    updateQuery({ conversationStatus: status });
  };

  const handleConversationClientIdChange = (value: string) => {
    setConversationClientId(value);
    updateQuery({ clientId: value });
  };

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

  const openConversationItem = async (item: ConversationItem) => {
    if (item.openThreadType === 'support') {
      router.push('/admin/support?tab=pool');
      return;
    }

    if (item.openThreadType === 'assist') {
      handleViewModeChange('assist');
      await openAssistThread(item.openThreadId);
      return;
    }

    if (item.openThreadType === 'private' || item.openThreadType === 'project') {
      handleViewModeChange('general');
      await openChatThread({
        id: item.openThreadId,
        type: item.openThreadType,
        projectId: item.projectId,
        projectName: item.projectName,
        updatedAt: item.latestAt,
        unreadCount: 0,
        status: item.status,
      });
    }
  };

  // Mark thread as read
  const markThreadAsRead = async () => {
    if (!activeId || !accessToken || activeType === 'assist') return;
    setMsgSubmitting(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/chat/${activeType}/${encodeURIComponent(activeId)}/read`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to mark thread as read');
      // Refresh thread list to update unread counts
      await fetchChatThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark thread as read");
    } finally {
      setMsgSubmitting(false);
    }
  };

  // Close thread
  const closeThread = async () => {
    if (!activeId || !accessToken || activeType === 'assist') return;
    setMsgSubmitting(true);
    try {
      const url = `${API_BASE_URL.replace(/\/$/, "")}/chat/${activeType}/${encodeURIComponent(activeId)}/close`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to close thread');
      // Refresh thread list to update status
      await fetchChatThreads();
      // Update local messages display if needed
      setMessages([]);
      setActiveId(null);
      setActiveType(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close thread");
    } finally {
      setMsgSubmitting(false);
    }
  };

  const getThreadLabel = (thread: ChatThread) => {
    if (thread.type === 'private') {
      if (thread.projectId) {
        return thread.lastMessageContext?.projectName?.trim() || 'Project Support';
      }
      if (thread.lastMessageContext?.pageType === 'project_view') {
        return thread.lastMessageContext.projectName?.trim() || 'Project Support';
      }
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
      if (thread.projectId) {
        return 'Project Support';
      }
      if (thread.lastMessageContext?.pageType === 'project_view') {
        return 'Project Support';
      }
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
      if (thread.projectId) {
        return 'project';
      }
      if (thread.lastMessageContext?.pageType === 'project_view') {
        return 'project';
      }
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

  const getAssistMethodLabel = (method?: string) => {
    if (method === 'call') return 'Book a call';
    if (method === 'whatsapp') return 'Please WhatsApp me';
    return 'In-platform chat';
  };

  const getSlaVisual = (req: AssistRequest) => {
    const now = Date.now();
    const createdAt = new Date(req.createdAt).getTime();
    const isNew = now - createdAt <= 5 * 60 * 1000;
    const firstRepliedAt = req.case?.firstRepliedAt ? new Date(req.case.firstRepliedAt).getTime() : null;
    const slaDeadline = req.case?.slaDeadline ? new Date(req.case.slaDeadline).getTime() : null;
    const isBreached = !firstRepliedAt && !!slaDeadline && now > slaDeadline;
    const isDueSoon = !firstRepliedAt && !!slaDeadline && slaDeadline - now <= 20 * 60 * 1000 && slaDeadline - now > 0;

    if (isBreached) {
      return {
        wrapper: 'border-rose-300 ring-2 ring-rose-100',
        badge: 'bg-rose-100 text-rose-800 border border-rose-200',
        label: 'SLA breached',
      };
    }

    if (isDueSoon) {
      return {
        wrapper: 'border-amber-300 ring-2 ring-amber-100',
        badge: 'bg-amber-100 text-amber-800 border border-amber-200',
        label: 'SLA due soon',
      };
    }

    if (isNew) {
      return {
        wrapper: 'border-emerald-300 ring-2 ring-emerald-100',
        badge: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
        label: 'New (<5 min)',
      };
    }

    return {
      wrapper: 'border-slate-200',
      badge: 'bg-slate-100 text-slate-700 border border-slate-200',
      label: 'Within SLA',
    };
  };

  const statusEligible = (msgType: string) => ['support', 'supplier-client', 'anonymous'].includes(msgType);
  const filterButtonBase = 'min-w-[150px] h-10 rounded-md px-4 text-sm font-semibold border transition flex items-center justify-center gap-2';
  const smallFilterButtonBase = 'min-w-[150px] h-9 rounded-md px-3 text-sm font-semibold border transition flex items-center justify-center gap-2';
  const effectiveTypeFilter = viewMode === 'all' ? 'all' : typeFilter;
  const effectiveStatusFilter = viewMode === 'all' ? 'all' : statusFilter;

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
          onClick={() => handleViewModeChange('all')}
          className={`${filterButtonBase} ${
            viewMode === 'all'
              ? 'bg-slate-900 text-white border-slate-950'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          🔔 All Messages
        </button>
        <button
          onClick={() => handleViewModeChange('assist')}
          className={`${filterButtonBase} ${
            viewMode === 'assist'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          📋 Assist Requests
        </button>
        <button
          onClick={() => handleViewModeChange('general')}
          className={`${filterButtonBase} ${
            viewMode === 'general'
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          💬 Support Chat
        </button>
        <button
          onClick={() => handleViewModeChange('conversations')}
          className={`${filterButtonBase} ${
            viewMode === 'conversations'
              ? 'bg-indigo-700 text-white border-indigo-800'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          🧭 Conversations
        </button>
        <button
          onClick={() => handleCaseViewModeChange('cases')}
          className={`${filterButtonBase} ${
            viewMode === 'cases'
              ? 'bg-rose-700 text-white border-rose-800'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          🗂️ Cases
        </button>
      </div>

      {viewMode === 'cases' && (
        <>
          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-slate-600">Case Status:</span>
            {(['open', 'in_progress', 'closure_pending', 'closed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => handleAssistStatusChange(status)}
                className={`${smallFilterButtonBase} ${
                  statusTab === status
                    ? 'bg-rose-600 text-white border-rose-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {status === 'open'
                  ? '📖 Open'
                  : status === 'in_progress'
                    ? '⏳ In Progress'
                    : status === 'closure_pending'
                      ? '💤 Pending Closure'
                      : '✅ Closed'}
              </button>
            ))}
            <div className="ml-auto text-sm text-slate-600">
              {requests.filter((req) => !!req.case).length} cases
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {assistLoading ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading...</div>
              ) : requests.filter((req) => !!req.case).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No cases found.</div>
              ) : (
                requests
                  .filter((req) => !!req.case)
                  .map((req) => {
                    const visual = getSlaVisual(req);
                    return (
                      <div
                        key={req.id}
                        className={`rounded-lg border ${
                          activeId === req.id && activeType === 'assist'
                            ? 'border-emerald-300 ring-2 ring-emerald-100'
                            : visual.wrapper
                        } bg-white p-4 shadow-sm cursor-pointer hover:border-slate-300 transition`}
                        onClick={() => openAssistThread(req.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${visual.badge}`}>
                                {visual.label}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
                                {req.case?.caseNumber || 'Case pending'}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                                {(req.case?.category || req.category || 'general').replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-slate-900">{req.project.projectName}</div>
                            <div className="text-xs text-slate-600">
                              {req.project.region} • {req.project.clientName}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Raised by: {req.case?.raisedBy || req.raisedBy || 'client'}
                            </div>
                            {req.case?.slaDeadline && !req.case?.firstRepliedAt && (
                              <div className="mt-1 text-xs text-slate-600">
                                SLA deadline: {new Date(req.case.slaDeadline).toLocaleString('en-GB')}
                              </div>
                            )}
                            {req.notes && (
                              <p className="mt-1 text-xs text-slate-700 line-clamp-2">{req.notes}</p>
                            )}
                            <div className="mt-1 text-xs text-slate-500">{new Date(req.createdAt).toLocaleString()}</div>
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
                    );
                  })
              )}
            </div>

            {activeId && activeType === 'assist' && (
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col h-[600px]">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Case Messages</h3>
                </div>
                <div ref={adminMessagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {msgLoading ? (
                    <div className="text-center text-slate-500 text-sm">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm">No messages yet.</div>
                  ) : (
                    messages.map((msg) => {
                      const isFoh = msg.senderType === 'foh';
                      return (
                        <div key={msg.id} className={`flex ${isFoh ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              isFoh ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-900'
                            }`}
                          >
                            {!isFoh && <div className="text-xs font-semibold mb-1 text-slate-600">User</div>}
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            <div className={`text-xs mt-1 ${isFoh ? 'text-emerald-100' : 'text-slate-500'}`}>
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
                  {error && <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>}
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

      {viewMode === 'conversations' && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleConversationChannelChange('all')}
              className={`${smallFilterButtonBase} ${conversationChannel === 'all' ? 'bg-slate-900 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              All Channels
            </button>
            <button
              onClick={() => handleConversationChannelChange('private_chat')}
              className={`${smallFilterButtonBase} ${conversationChannel === 'private_chat' ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'}`}
            >
              Private Chat
            </button>
            <button
              onClick={() => handleConversationChannelChange('project_chat')}
              className={`${smallFilterButtonBase} ${conversationChannel === 'project_chat' ? 'bg-purple-600 text-white border-purple-700' : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'}`}
            >
              Project Chat
            </button>
            <button
              onClick={() => handleConversationChannelChange('assist')}
              className={`${smallFilterButtonBase} ${conversationChannel === 'assist' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'}`}
            >
              Assist
            </button>
            <button
              onClick={() => handleConversationChannelChange('support_whatsapp')}
              className={`${smallFilterButtonBase} ${conversationChannel === 'support_whatsapp' ? 'bg-green-700 text-white border-green-800' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
            >
              WhatsApp
            </button>
            <button
              onClick={() => handleConversationChannelChange('support_callback')}
              className={`${smallFilterButtonBase} ${conversationChannel === 'support_callback' ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'}`}
            >
              Callback
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'open', 'in_progress', 'closure_pending', 'closed', 'resolved', 'active', 'unassigned', 'claimed'] as const).map((statusValue) => (
              <button
                key={statusValue}
                onClick={() => handleConversationStatusChange(statusValue)}
                className={`${smallFilterButtonBase} ${conversationStatus === statusValue ? 'bg-slate-900 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              >
                {statusValue === 'all' ? 'All Status' : statusValue.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Client Id</label>
            <input
              value={conversationClientId}
              onChange={(e) => handleConversationClientIdChange(e.target.value)}
              className="h-9 w-full max-w-sm rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Filter by client id"
            />
            {conversationClientId && (
              <button
                onClick={() => handleConversationClientIdChange('')}
                className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Message Type Filters (for chat view) */}
      {(viewMode === 'general' || viewMode === 'all') && (
        <div className="flex gap-2 overflow-x-auto pb-1 whitespace-nowrap">
          <button
            onClick={() => handleTypeFilterChange('all')}
            className={`${smallFilterButtonBase} ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-950'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => handleTypeFilterChange('support')}
            className={`${smallFilterButtonBase} ${
              typeFilter === 'support'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
            }`}
          >
            🆘 Support Requests
          </button>
          <button
            onClick={() => handleTypeFilterChange('supplier-client')}
            className={`${smallFilterButtonBase} flex-shrink-0 ${
              typeFilter === 'supplier-client'
                ? 'bg-indigo-600 text-white border-indigo-700'
                : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            🤝 Supplier/Client
          </button>
          <button
            onClick={() => handleTypeFilterChange('anonymous')}
            className={`${smallFilterButtonBase} flex-shrink-0 ${
              typeFilter === 'anonymous'
                ? 'bg-gray-600 text-white border-gray-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            👤 Anonymous
          </button>
          <button
            onClick={() => handleTypeFilterChange('project')}
            className={`${smallFilterButtonBase} flex-shrink-0 ${
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
      {(viewMode === 'general' || viewMode === 'all') && statusEligible(effectiveTypeFilter) && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleStatusFilterChange('all')}
            className={`${smallFilterButtonBase} ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-950'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            All Statuses
          </button>
          <button
            onClick={() => handleStatusFilterChange('open')}
            className={`${smallFilterButtonBase} ${
              statusFilter === 'open'
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
            }`}
          >
            📖 Open
          </button>
          <button
            onClick={() => handleStatusFilterChange('in_progress')}
            className={`${smallFilterButtonBase} ${
              statusFilter === 'in_progress'
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            ⏳ In Progress
          </button>
          <button
            onClick={() => handleStatusFilterChange('closed')}
            className={`${smallFilterButtonBase} ${
              statusFilter === 'closed'
                ? 'bg-slate-700 text-white border-slate-800'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            ✅ Closed
          </button>
          <button
            onClick={() => handleStatusFilterChange('closure_pending')}
            className={`${smallFilterButtonBase} ${
              statusFilter === 'closure_pending'
                ? 'bg-sky-700 text-white border-sky-800'
                : 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'
            }`}
          >
            💤 Pending Closure
          </button>
        </div>
      )}

      {/* Assist Requests View */}
      {(viewMode === 'assist' || viewMode === 'all') && (
        <>
          {/* Status Tabs for Assist Requests */}
          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-slate-600">Assist Request Status:</span>
            {(['open', 'in_progress', 'closure_pending', 'closed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => handleAssistStatusChange(status)}
                className={`${smallFilterButtonBase} ${
                  statusTab === status
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {status === 'open'
                  ? '📖 Open'
                  : status === 'in_progress'
                    ? '⏳ In Progress'
                    : status === 'closure_pending'
                      ? '💤 Pending Closure'
                      : '✅ Closed'}
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
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 border border-indigo-200">
                            {getAssistMethodLabel(req.contactMethod)}
                          </span>
                          {req.requestedCallAt && (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 border border-amber-200">
                              {new Date(req.requestedCallAt).toLocaleString('en-GB', {
                                timeZone: req.requestedCallTimezone || 'Asia/Hong_Kong',
                                weekday: 'short',
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
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
                <div ref={adminMessagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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
      {(viewMode === 'general' || viewMode === 'all') && (
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
                  if (effectiveTypeFilter !== 'all' && msgType !== effectiveTypeFilter) return false;
                  if (effectiveStatusFilter !== 'all' && statusEligible(msgType)) {
                    const statusValue = thread.status || 'open';
                    return statusValue === effectiveStatusFilter;
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
              <div ref={adminMessagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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
                
                {/* Thread Control Buttons */}
                {activeId && (activeType === 'private' || activeType === 'anonymous' || activeType === 'project') && (
                  <div className="mb-3 flex gap-2">
                    <button
                      onClick={() => markThreadAsRead()}
                      disabled={msgSubmitting}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      ✓ Mark Read
                    </button>
                    <button
                      onClick={() => closeThread()}
                      disabled={msgSubmitting}
                      className="px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-medium hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      🔒 Close Thread
                    </button>
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

      {viewMode === 'conversations' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {conversationsLoading ? (
            <div className="p-6 text-sm text-slate-600">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">No conversations match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Initiator</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Initial Message</th>
                    <th className="px-4 py-3">Media</th>
                    <th className="px-4 py-3">Latest</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{new Date(item.startedAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{item.initiatedBy}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{item.channel.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-slate-900">
                        <div className="font-semibold">{item.clientName}</div>
                        {item.clientEmail && <div className="text-xs text-slate-500">{item.clientEmail}</div>}
                        {item.clientId && <div className="text-xs text-slate-500">{item.clientId}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs">{item.initialMessage || '-'}</td>
                      <td className="px-4 py-3 text-slate-700 text-center">{item.mediaCount}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{new Date(item.latestAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{item.status}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.projectId ? (
                          <Link href={`/projects/${item.projectId}`} className="text-indigo-700 hover:underline">
                            {item.projectName || item.projectId}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => openConversationItem(item)}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
