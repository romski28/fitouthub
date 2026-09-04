"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { useRoleGuard } from "@/hooks/use-role-guard";
import ChatEventCard from "@/components/chat-event-card";
import { parseChatEvent } from "@/lib/chat-event-parser";

type QueueProject = {
  id: string;
  projectName: string;
  region?: string;
  tradesRequired?: string[];
  isEmergency?: boolean;
  onlySelectedProfessionalsCanBid?: boolean;
  tenderOpenedAt?: string;
  createdAt?: string;
  status?: string;
  currentStage?: string;
  releasedForQuotationAt?: string | null;
  updatedAt?: string;
  user?: {
    firstName?: string;
    surname?: string;
    email?: string;
  };
};

type InboxItem = {
  id: string;
  threadType: "project-professional" | "project-general" | "project-private";
  threadId: string;
  projectId: string;
  projectName: string;
  senderName: string;
  senderType: string;
  content: string;
  createdAt: string;
};

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

function formatRelativeTime(date?: string): string {
  if (!date) return "";
  const then = new Date(date).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

export default function PmHomePage() {
  useRoleGuard(["project_manager"], { fallback: "/" });
  const { accessToken } = useAuth();

  // Queue
  const [projects, setProjects] = useState<QueueProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [showAllQueue, setShowAllQueue] = useState(false);

  // My projects
  const [myProjects, setMyProjects] = useState<QueueProject[]>([]);
  const [myLoading, setMyLoading] = useState(true);

  // Inbox
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);

  // Mobile tab picker (desktop shows all sections side-by-side)
  const [mobileTab, setMobileTab] = useState<"inbox" | "queue" | "mine">("inbox");

  const fetchQueue = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/queue`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load queue (${res.status})`);
      }
      const data = await res.json();
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const fetchMyProjects = useCallback(async () => {
    if (!accessToken) return;
    setMyLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMyProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch {
      /* best-effort */
    } finally {
      setMyLoading(false);
    }
  }, [accessToken]);

  const fetchInbox = useCallback(async () => {
    if (!accessToken) return;
    setInboxLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/inbox/unread`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setInbox(Array.isArray(data?.items) ? data.items : []);
    } catch {
      /* best-effort */
    } finally {
      setInboxLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchQueue();
    void fetchMyProjects();
    void fetchInbox();
  }, [fetchQueue, fetchMyProjects, fetchInbox]);

  // Auto-refresh the inbox every 60s
  useEffect(() => {
    const id = setInterval(() => void fetchInbox(), 60000);
    return () => clearInterval(id);
  }, [fetchInbox]);

  const handleClaim = async (projectId: string) => {
    if (!accessToken) return;
    setClaimingId(projectId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to claim (${res.status})`);
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      // Refresh "My Projects" so the newly claimed project appears there.
      void fetchMyProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim project");
    } finally {
      setClaimingId(null);
    }
  };

  const handleMarkRead = async (item: InboxItem) => {
    if (!accessToken) return;
    await fetch(`${API_BASE_URL}/projects/pm/inbox/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ threadType: item.threadType, threadId: item.threadId }),
    }).catch(() => undefined);
    void fetchInbox();
  };

  const handleReply = async (item: InboxItem) => {
    if (!accessToken || !replyText.trim()) return;
    setReplyingId(item.id);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/inbox/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadType: item.threadType, threadId: item.threadId, content: replyText.trim() }),
      });
      if (!res.ok) throw new Error("Failed to send reply");
      setReplyText("");
      setReplyOpenId(null);
      await handleMarkRead(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setReplyingId(null);
    }
  };

  const sortedQueue = [...projects].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
  );
  const visibleQueue = showAllQueue ? sortedQueue : sortedQueue.slice(0, 10);

  const inboxSection = (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Inbox</h2>
          <p className="text-xs text-slate-500">{inbox.length} unread</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchInbox()}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          Refresh
        </button>
      </header>
      <div className="space-y-2 p-2">
        {inboxLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading…</div>
        ) : inbox.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">You&apos;re all caught up.</div>
        ) : (
          inbox.map((item) => {
            const event = parseChatEvent(item.content);
            const isReplying = replyOpenId === item.id;
            return (
              <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                {/* Row 1: from -> to -> when  +  Read it */}
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1 text-[11px]">
                    <span className="font-semibold text-slate-800">{item.senderName}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-500">You</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatRelativeTime(item.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleMarkRead(item)}
                    className="w-28 shrink-0 whitespace-nowrap rounded bg-orange-500 px-2 py-0.5 text-center text-[11px] font-normal text-white hover:bg-orange-600"
                  >
                    Read it
                  </button>
                </div>

                {/* Row 2: project title  +  Open project */}
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-700">{item.projectName}</p>
                  <Link
                    href={`/pm/projects/${item.projectId}`}
                    onClick={() => void handleMarkRead(item)}
                    className="w-28 shrink-0 whitespace-nowrap rounded bg-blue-600 px-2 py-0.5 text-center text-[11px] font-normal text-white hover:bg-blue-700"
                  >
                    Open project
                  </Link>
                </div>

                {/* Row 3: message preview (type only for cards)  +  Reply */}
                {!isReplying && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {event ? (
                        <p className="line-clamp-1 text-xs text-slate-600">
                          {event.icon} {event.title}
                        </p>
                      ) : (
                        <p className="line-clamp-1 text-xs text-slate-600">{item.content}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyOpenId(item.id);
                        setReplyText("");
                      }}
                      className="w-28 shrink-0 whitespace-nowrap rounded bg-emerald-600 px-2 py-0.5 text-center text-[11px] font-normal text-white hover:bg-emerald-700"
                    >
                      Reply
                    </button>
                  </div>
                )}

                {/* Reply expansion: full message + cancel/send (replaces the preview row) */}
                {isReplying && (
                  <div className="mt-2 space-y-1.5">
                    {event ? (
                      <div className="overflow-hidden rounded-xl border border-slate-700">
                        <ChatEventCard event={event} />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-xs text-slate-600">{item.content}</p>
                    )}
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      placeholder="Reply…"
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyOpenId(null);
                          setReplyText("");
                        }}
                        className="rounded bg-red-600 px-3 py-1 text-xs font-normal text-white hover:bg-red-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReply(item)}
                        disabled={replyingId === item.id || !replyText.trim()}
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-normal text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {replyingId === item.id ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );

  const queueSection = (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">The Queue</h2>
          <p className="text-xs text-slate-500">{projects.length} awaiting</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchQueue()}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          Refresh
        </button>
      </header>
      <div className="space-y-2 p-2">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : visibleQueue.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">Queue empty.</div>
        ) : (
          visibleQueue.map((project) => (
            <div key={project.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-slate-900">{project.projectName}</h3>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {[project.region, project.user ? `${project.user.firstName || ""} ${project.user.surname || ""}`.trim() : null]
                      .filter(Boolean)
                      .join(" · ") || "No location"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Registered {formatDate(project.createdAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={!!claimingId}
                  onClick={() => void handleClaim(project.id)}
                  className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {claimingId === project.id ? "Claiming…" : "Claim"}
                </button>
              </div>
            </div>
          ))
        )}
        {!loading && projects.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAllQueue((v) => !v)}
            className="w-full rounded py-1 text-center text-[11px] font-semibold text-slate-500 hover:text-slate-700"
          >
            {showAllQueue ? "Show fewer" : `Show all (${projects.length})`}
          </button>
        )}
      </div>
    </section>
  );

  const mineSection = (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">My Projects</h2>
          <p className="text-xs text-slate-500">{myProjects.length} claimed</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchMyProjects()}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          Refresh
        </button>
      </header>
      <div className="space-y-2 p-2">
        {myLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading…</div>
        ) : myProjects.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">No claimed projects yet.</div>
        ) : (
          myProjects.map((project) => (
            <Link
              key={project.id}
              href={`/pm/projects/${project.id}`}
              className="block rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 transition hover:border-emerald-300"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-xs font-semibold text-slate-900">{project.projectName}</h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    project.releasedForQuotationAt
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  {project.releasedForQuotationAt ? "Released" : "Awaiting release"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{project.region || "No location"}</p>
            </Link>
          ))
        )}
      </div>
    </section>
  );

  const mobileTabs = [
    { key: "queue" as const, label: "Queue", count: projects.length },
    { key: "mine" as const, label: "My Projects", count: myProjects.length },
    { key: "inbox" as const, label: "Inbox", count: inbox.length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      {/* Compact header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">PM Home</h1>
          <p className="text-xs text-slate-500">Claim projects, release tenders, and answer questions.</p>
        </div>
      </div>

      {/* Mobile tab picker */}
      <div className="mb-3 flex rounded-lg border border-slate-200 bg-white p-1 md:hidden">
        {mobileTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMobileTab(t.key)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
              mobileTab === t.key ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
            {t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* Mobile: active section only */}
      <div className="space-y-3 md:hidden">
        {mobileTab === "inbox" && inboxSection}
        {mobileTab === "queue" && queueSection}
        {mobileTab === "mine" && mineSection}
      </div>

      {/* Desktop: side-by-side sections */}
      <div className="hidden grid-cols-2 items-start gap-4 md:grid xl:grid-cols-3">
        {queueSection}
        {mineSection}
        {inboxSection}
      </div>
    </div>
  );
}
