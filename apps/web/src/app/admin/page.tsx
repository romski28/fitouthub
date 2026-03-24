"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { API_BASE_URL } from "@/config/api";

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
  type: string;
  transport: string;
  context: string;
  user: string;
  status: string;
  preview: string;
  createdAt: string;
  href: string;
};

type AdminCommsFeed = {
  items: AdminCommsFeedItem[];
  generatedAt: string;
};

type AdminTabKey = "dashboard" | "messaging" | "data-control" | "analytics";

const tabMeta: { key: AdminTabKey; label: string; blurb: string }[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    blurb: "Unified message feed across support, assist, inbox, notifications, and safety triage.",
  },
  {
    key: "messaging",
    label: "Messaging",
    blurb: "Execution pages for all queues and channels that require admin response.",
  },
  {
    key: "data-control",
    label: "Data Control",
    blurb: "Core records, governance, and configuration surfaces.",
  },
  {
    key: "analytics",
    label: "Analytics",
    blurb: "Metrics and audit views, with room to expand in future iterations.",
  },
];

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
    return "bg-amber-500/20 text-amber-200 border border-amber-500/40";
  }
  if (["in_progress", "in review", "claimed", "delivered", "read", "tagged_emergency"].includes(normalized)) {
    return "bg-sky-500/20 text-sky-200 border border-sky-500/40";
  }
  if (["resolved", "closed", "sent", "success"].includes(normalized)) {
    return "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40";
  }
  if (["failed", "undeliverable", "danger"].includes(normalized)) {
    return "bg-rose-500/20 text-rose-200 border border-rose-500/40";
  }
  return "bg-slate-700 text-slate-200 border border-slate-600";
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
  const { user, accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabKey>("dashboard");
  const [opsSummary, setOpsSummary] = useState<AdminOpsSummary | null>(null);
  const [feed, setFeed] = useState<AdminCommsFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

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
    if (!accessToken || activeTab !== "dashboard") return;

    const fetchFeed = async () => {
      setFeedLoading(true);
      setFeedError(null);
      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/updates/admin-comms-feed?limit=80`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load communications feed");
        }

        const payload = (await response.json()) as AdminCommsFeed;
        setFeed(payload.items || []);
      } catch (error) {
        setFeedError(error instanceof Error ? error.message : "Unable to load communications feed");
      } finally {
        setFeedLoading(false);
      }
    };

    fetchFeed();
  }, [accessToken, activeTab]);

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
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
        <h1 className="mt-1 text-3xl font-bold">
          Control Center{user?.firstName ? ` · ${user.firstName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-slate-200/90">
          Four focused sections: Dashboard, Messaging, Data Control, and Analytics.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {tabMeta.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  isActive
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className={`text-sm font-semibold ${isActive ? "text-emerald-700" : "text-slate-900"}`}>
                  {tab.label}
                </p>
                <p className="mt-1 text-xs text-slate-600">{tab.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Messaging Work</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{opsSummary?.support.totalOpen ?? 0}</p>
              <p className="text-xs text-slate-600">Support pool + active support threads</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unread Inbox</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {(opsSummary?.inbox.privateUnreadMessages ?? 0) + (opsSummary?.assist.unreadClientMessages ?? 0)}
              </p>
              <p className="text-xs text-slate-600">Private + assist unread messages</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Safety Triage</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{opsSummary?.safety.highOrCritical ?? 0}</p>
              <p className="text-xs text-slate-600">High or critical platform alerts</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Unified Messaging Feed</h2>
                <p className="text-xs text-slate-600">
                  Type, transport, context, user, and status across all admin-facing message channels.
                </p>
              </div>
              <Link
                href="/admin/messaging?view=all"
                className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
              >
                Open messaging workspace
              </Link>
            </div>

            {feedLoading && (
              <div className="px-4 py-6 text-sm text-slate-600">Loading communications feed...</div>
            )}

            {!feedLoading && feedError && (
              <div className="m-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {feedError}
              </div>
            )}

            {!feedLoading && !feedError && feed.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-600">No feed items yet.</div>
            )}

            {!feedLoading && !feedError && feed.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Transport</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Context</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">User</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Message</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feed.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-slate-900">
                          <Link href={item.href} className="font-semibold text-emerald-700 hover:text-emerald-800">
                            {item.type}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{item.transport}</td>
                        <td className="px-3 py-2 text-slate-700">{item.context}</td>
                        <td className="px-3 py-2 text-slate-700">{item.user}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}>
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="max-w-[360px] truncate px-3 py-2 text-slate-700" title={item.preview}>
                          {item.preview}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{formatRelativeTime(item.createdAt)}</td>
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
    </div>
  );
}
