"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { API_BASE_URL } from "@/config/api";
import { useSearchParams } from "next/navigation";

type AdminOpsSummary = {
  support: {
    unassigned: number;
    claimed: number;
    inProgress: number;
    resolved: number;
    myClaimed: number;
    myInProgress: number;
    totalOpen: number;
  };
  inbox: {
    privateUnreadMessages: number;
    privateUnreadThreads: number;
    anonymousOpenThreads: number;
    anonymousMessages: number;
  };
  assist: {
    open: number;
    inProgress: number;
    closed: number;
    unreadClientMessages: number;
  };
  adminActions: {
    pending: number;
    inReview: number;
    escalated: number;
    urgent: number;
    assignedToMe: number;
  };
  safety: {
    highOrCritical: number;
    requiresEscalation: number;
    emergencyNotTagged: number;
  };
  generatedAt: string;
};

type AdminCommsFeedItem = {
  id: string;
  sourceType: string;
  sourceId: string;
  type: string;
  transport: string;
  context: string;
  user: string;
  status: string;
  assignmentStatus: string;
  claimedByAdminId?: string;
  claimedByAdminName?: string;
  assignedToAdminId?: string;
  assignedToAdminName?: string;
  isMine?: boolean;
  preview: string;
  createdAt: string;
  href: string;
};

type AdminCommsFeed = {
  items: AdminCommsFeedItem[];
  generatedAt: string;
};

type AdminAssignee = {
  id: string;
  name: string;
  email: string;
};

type AdminTabKey = "dashboard" | "messaging" | "data-control" | "analytics";
type FeedScope = "all" | "my" | "unassigned";

const formatRelativeTime = (dateValue: string) => {
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return "-";

  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
};

const statusBadgeClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (["unassigned", "open", "pending", "needs_review"].includes(normalized)) {
    return "border-2 border-amber-400 text-white";
  }
  if (["in_progress", "in review", "claimed", "delivered", "read", "tagged_emergency"].includes(normalized)) {
    return "border-2 border-sky-400 text-white";
  }
  if (["resolved", "closed", "sent", "success"].includes(normalized)) {
    return "border-2 border-emerald-400 text-white";
  }
  if (["failed", "undeliverable", "danger"].includes(normalized)) {
    return "border-2 border-rose-400 text-white";
  }
  return "border-2 border-violet-400 text-white";
};

function QuickCard({
  title,
  description,
  href,
  stat,
}: {
  title: string;
  description: string;
  href: string;
  stat?: string;
}) {
  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
        <h3 className="text-base font-semibold">{title}</h3>
        {stat && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">{stat}</p>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm text-slate-700">{description}</p>
        <p className="mt-2 text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
          Open →
        </p>
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { accessToken, user } = useAuth();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: AdminTabKey =
    requestedTab === "dashboard" ||
    requestedTab === "messaging" ||
    requestedTab === "data-control" ||
    requestedTab === "analytics"
      ? requestedTab
      : "dashboard";
  const [opsSummary, setOpsSummary] = useState<AdminOpsSummary | null>(null);
  const [feed, setFeed] = useState<AdminCommsFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedScope, setFeedScope] = useState<FeedScope>("all");
  const [assignees, setAssignees] = useState<AdminAssignee[]>([]);
  const [selectedItem, setSelectedItem] = useState<AdminCommsFeedItem | null>(null);
  const [assigningToAdminId, setAssigningToAdminId] = useState<string>("");
  const [actionBusy, setActionBusy] = useState(false);

  const fetchFeed = useCallback(async () => {
    if (!accessToken || activeTab !== "dashboard") return;

    setFeedLoading(true);
    setFeedError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL.replace(/\/$/, "")}/updates/admin-comms-feed?limit=80&scope=${feedScope}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to load communications feed");
      }

      const payload = (await response.json()) as AdminCommsFeed;
      setFeed(payload.items || []);

      if (selectedItem) {
        const refreshedSelected = (payload.items || []).find(
          (item) =>
            item.sourceType === selectedItem.sourceType && item.sourceId === selectedItem.sourceId,
        );
        setSelectedItem(refreshedSelected || null);
      }
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Unable to load communications feed");
    } finally {
      setFeedLoading(false);
    }
  }, [accessToken, activeTab, feedScope, selectedItem]);

  useEffect(() => {
    if (!accessToken) return;

    const fetchOpsSummary = async () => {
      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/updates/admin-ops-summary`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as AdminOpsSummary;
        setOpsSummary(payload);
      } catch {
        // no-op for non-blocking summary cards
      }
    };

    fetchOpsSummary();
  }, [accessToken]);

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    if (!accessToken || activeTab !== "dashboard") return;

    const fetchAssignees = async () => {
      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/updates/admin-comms-assignees`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as AdminAssignee[];
        setAssignees(payload || []);
      } catch {
        // non-blocking
      }
    };

    fetchAssignees();
  }, [accessToken, activeTab]);

  useEffect(() => {
    if (!selectedItem) {
      setAssigningToAdminId("");
      return;
    }
    setAssigningToAdminId(selectedItem.assignedToAdminId || "");
  }, [selectedItem]);

  const postAssignmentAction = async (
    action: "claim" | "assign" | "release",
    body: { sourceType: string; sourceId: string; assignedToAdminId?: string },
  ) => {
    if (!accessToken) return;

    setActionBusy(true);
    try {
      const response = await fetch(
        `${API_BASE_URL.replace(/\/$/, "")}/updates/admin-comms-feed/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to update assignment");
      }

      await fetchFeed();
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Failed to update assignment");
    } finally {
      setActionBusy(false);
    }
  };

  const messagingCards = useMemo(
    () => [
      {
        title: "Support Pool",
        description: "Inbound callback and WhatsApp requests awaiting assignment and handling.",
        href: "/admin/support?tab=pool",
        stat: `${opsSummary?.support.unassigned ?? 0} unassigned`,
      },
      {
        title: "My Queue",
        description: "Claimed and in-progress items assigned to you.",
        href: "/admin/messaging?view=general&type=supplier-client&status=in_progress",
        stat: `${opsSummary?.support.myClaimed ?? 0} claimed · ${opsSummary?.support.myInProgress ?? 0} in progress`,
      },
      {
        title: "Support Inbox",
        description: "Private and anonymous FOH inbox threads requiring response.",
        href: "/admin/messaging?view=general&type=support&status=open",
        stat: `${opsSummary?.inbox.privateUnreadMessages ?? 0} unread`,
      },
      {
        title: "Assist Queue",
        description: "Client assist requests across chat, call booking, and WhatsApp.",
        href: "/admin/messaging?view=assist&assistStatus=open",
        stat: `${opsSummary?.assist.open ?? 0} open`,
      },
      {
        title: "Safety Triage",
        description: "High-risk platform alerts from AI intake that require admin action.",
        href: "/admin/projects",
        stat: `${opsSummary?.safety.highOrCritical ?? 0} high/critical`,
      },
      {
        title: "Announcements",
        description: "Manage platform announcement ticker messages.",
        href: "/admin/announcements",
        stat: "Ticker management",
      },
      {
        title: "Messaging Workspace",
        description: "Open the unified messaging page with all queue filters.",
        href: "/admin/messaging?view=all",
        stat: "All queues",
      },
    ],
    [opsSummary],
  );

  const dataControlCards = [
    {
      title: "Professionals",
      description: "Approve, review, and maintain professional records.",
      href: "/admin/professionals",
      stat: "Professional records",
    },
    {
      title: "Users",
      description: "Client and admin account management.",
      href: "/admin/users",
      stat: "User records",
    },
    {
      title: "Trades",
      description: "Trade catalogue and service mapping controls.",
      href: "/admin/trades",
      stat: "Trade setup",
    },
    {
      title: "Projects",
      description: "Project-level controls and admin actions.",
      href: "/admin/projects",
      stat: `${opsSummary?.adminActions.pending ?? 0} pending admin actions`,
    },
    {
      title: "Reports",
      description: "Review and moderate submitted professional reports.",
      href: "/admin/reports",
      stat: "Moderation queue",
    },
    {
      title: "Policies",
      description: "Terms, security statements, and template governance.",
      href: "/admin/policies",
      stat: "Policy control",
    },
    {
      title: "Activity Log",
      description: "Detailed audit history of operations and edits.",
      href: "/admin/activity-log",
      stat: "Audit trail",
    },
  ];

  const analyticsCards = [
    {
      title: "Analytics",
      description: "Snapshot metrics and trend views.",
      href: "/admin/analytics",
      stat: "Primary analytics page",
    },
    {
      title: "Activity Log",
      description: "Audit stream available as a dedicated page for deeper review.",
      href: "/admin/activity-log",
      stat: "Detailed event history",
    },
  ];

  return (
    <div className="space-y-6">
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Open Messaging Work</p>
              <p className="mt-1 text-2xl font-bold text-white">{opsSummary?.support.totalOpen ?? 0}</p>
              <p className="text-xs text-slate-300">Support pool + active support threads</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Unread Msgs</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {(opsSummary?.inbox.privateUnreadMessages ?? 0) + (opsSummary?.assist.unreadClientMessages ?? 0)}
              </p>
              <p className="text-xs text-slate-300">Inbox + assist</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Safety Triage</p>
              <p className="mt-1 text-2xl font-bold text-white">{opsSummary?.safety.highOrCritical ?? 0}</p>
              <p className="text-xs text-slate-300">High or critical platform alerts</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Unified Messaging Feed</h2>
                <p className="text-xs text-slate-300">
                  Type, transport, context, user, and status across all admin-facing message channels.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-slate-600 bg-slate-900/60 p-0.5 text-[11px]">
                  {(["all", "my", "unassigned"] as FeedScope[]).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setFeedScope(scope)}
                      className={`rounded px-2 py-1 font-semibold uppercase tracking-wide transition ${
                        feedScope === scope
                          ? "bg-emerald-600 text-white"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {scope === "my" ? "My msgs" : scope}
                    </button>
                  ))}
                </div>
                <Link
                  href="/admin/messaging?view=all"
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  Workspace
                </Link>
              </div>
            </div>

            {feedLoading && (
              <div className="px-4 py-6 text-sm text-slate-300">Loading communications feed...</div>
            )}

            {!feedLoading && feedError && (
              <div className="m-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {feedError}
              </div>
            )}

            {!feedLoading && !feedError && feed.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-300">No feed items yet.</div>
            )}

            {!feedLoading && !feedError && feed.length > 0 && (
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-950/90">
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">Type</th>
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">Transport</th>
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">Context</th>
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">User</th>
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">Status</th>
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">Message</th>
                      <th className="sticky top-0 z-10 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-200">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feed.map((item) => (
                      <tr
                        key={item.id}
                        className="cursor-pointer border-b border-slate-700/70 hover:bg-slate-800/60"
                        onClick={() => setSelectedItem(item)}
                      >
                        <td className="px-3 py-2 text-white">
                          <button
                            type="button"
                            className="font-semibold text-emerald-300 hover:text-emerald-200"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedItem(item);
                            }}
                          >
                            {item.type}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-slate-200">{item.transport}</td>
                        <td className="px-3 py-2 text-slate-200">{item.context}</td>
                        <td className="px-3 py-2 text-slate-200">{item.user}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex h-7 w-36 items-center justify-center rounded-full px-3 text-center text-[11px] font-semibold uppercase tracking-wide leading-none whitespace-nowrap ${statusBadgeClass(item.status)}`}>
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="max-w-[360px] truncate px-3 py-2 text-slate-200" title={item.preview}>
                          {item.preview}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">{formatRelativeTime(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "messaging" && (
        <div className="grid gap-4 md:grid-cols-2">
          {messagingCards.map((card) => (
            <QuickCard key={card.title} {...card} />
          ))}
        </div>
      )}

      {activeTab === "data-control" && (
        <div className="grid gap-4 md:grid-cols-2">
          {dataControlCards.map((card) => (
            <QuickCard key={card.title} {...card} />
          ))}
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Analytics tab currently groups Analytics + Activity Log. Additional analytics surfaces can be added here in the next phase.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {analyticsCards.map((card) => (
              <QuickCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-30 flex justify-end bg-slate-950/55" onClick={() => setSelectedItem(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-gradient-to-b from-slate-900 to-slate-800 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Message Drawer</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{selectedItem.type}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-md border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
              <p className="text-slate-200"><span className="text-slate-400">Transport:</span> {selectedItem.transport}</p>
              <p className="text-slate-200"><span className="text-slate-400">Context:</span> {selectedItem.context}</p>
              <p className="text-slate-200"><span className="text-slate-400">User:</span> {selectedItem.user}</p>
              <p className="text-slate-200"><span className="text-slate-400">Message status:</span> {selectedItem.status.replace(/_/g, " ")}</p>
              <p className="text-slate-200"><span className="text-slate-400">Ownership:</span> {selectedItem.assignmentStatus}</p>
              {selectedItem.assignedToAdminName && (
                <p className="text-slate-200"><span className="text-slate-400">Assigned to:</span> {selectedItem.assignedToAdminName}</p>
              )}
              {selectedItem.claimedByAdminName && (
                <p className="text-slate-200"><span className="text-slate-400">Claimed by:</span> {selectedItem.claimedByAdminName}</p>
              )}
              <p className="text-slate-200"><span className="text-slate-400">Preview:</span> {selectedItem.preview}</p>
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                disabled={actionBusy || selectedItem.assignedToAdminId === user?.id}
                onClick={() =>
                  postAssignmentAction("claim", {
                    sourceType: selectedItem.sourceType,
                    sourceId: selectedItem.sourceId,
                  })
                }
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Claim as mine
              </button>

              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Assign to admin
                </label>
                <div className="flex gap-2">
                  <select
                    value={assigningToAdminId}
                    onChange={(event) => setAssigningToAdminId(event.target.value)}
                    className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white"
                  >
                    <option value="">Select admin</option>
                    {assignees.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={actionBusy || !assigningToAdminId}
                    onClick={() =>
                      postAssignmentAction("assign", {
                        sourceType: selectedItem.sourceType,
                        sourceId: selectedItem.sourceId,
                        assignedToAdminId: assigningToAdminId,
                      })
                    }
                    className="rounded-md border border-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={actionBusy}
                onClick={() =>
                  postAssignmentAction("release", {
                    sourceType: selectedItem.sourceType,
                    sourceId: selectedItem.sourceId,
                  })
                }
                className="w-full rounded-md border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700/60 disabled:opacity-50"
              >
                Release ownership
              </button>

              <Link
                href={selectedItem.href}
                className="inline-flex w-full items-center justify-center rounded-md border border-sky-400 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/10"
              >
                Open origin workspace
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
