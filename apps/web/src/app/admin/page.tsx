"use client";

import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { UpdatesButton } from "@/components/updates-button";

export default function AdminDashboard() {
  const { user, accessToken } = useAuth();
  const [outstandingReports, setOutstandingReports] = useState<number>(0);
  const [opsSummary, setOpsSummary] = useState<{
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
  } | null>(null);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/admin/reports/count`);
        if (res.ok) {
          const data = await res.json();
          setOutstandingReports(Number(data?.outstanding || 0));
        }
      } catch {}
    };
    fetchCount();
  }, []);

  useEffect(() => {
    const fetchOpsSummary = async () => {
      if (!accessToken) return;
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/updates/admin-ops-summary`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setOpsSummary(data);
        }
      } catch {}
    };
    fetchOpsSummary();
  }, [accessToken]);

  const operations = [
    {
      title: 'Support Pool',
      description: 'Unassigned and active callback/WhatsApp support requests waiting for claim or action.',
      href: '/admin/support?tab=pool',
      icon: '🧭',
      stats: `${opsSummary?.support.unassigned ?? 0} unassigned · ${opsSummary?.support.totalOpen ?? 0} open`,
    },
    {
      title: 'My Queue',
      description: 'Requests currently claimed by you and jobs already moved in progress.',
      href: '/admin/messaging?view=general&type=supplier-client&status=in_progress',
      icon: '✅',
      stats: `${opsSummary?.support.myClaimed ?? 0} claimed · ${opsSummary?.support.myInProgress ?? 0} in progress`,
    },
    {
      title: 'Support Inbox',
      description: 'Private and anonymous chat threads requiring FOH response from the inbox.',
      href: '/admin/messaging?view=general&type=support&status=open',
      icon: '💬',
      stats: `${opsSummary?.inbox.privateUnreadMessages ?? 0} unread · ${opsSummary?.inbox.anonymousOpenThreads ?? 0} anonymous threads`,
    },
    {
      title: 'Assist Queue',
      description: 'FOH assist requests opened by clients for scoping help, call bookings, and WhatsApp support.',
      href: '/admin/messaging?view=assist&assistStatus=open',
      icon: '🆘',
      stats: `${opsSummary?.assist.open ?? 0} open · ${opsSummary?.assist.unreadClientMessages ?? 0} unread client msgs`,
    },
    {
      title: 'Admin Actions',
      description: 'Pending/escalated platform actions and approvals across project lifecycle controls.',
      href: '/admin/projects',
      icon: '📌',
      stats: `${opsSummary?.adminActions.pending ?? 0} pending · ${opsSummary?.adminActions.urgent ?? 0} urgent`,
    },
    {
      title: 'Safety Triage',
      description: 'High-risk AI safety signals that may require escalation and emergency handling review.',
      href: '/admin/projects',
      icon: '🚨',
      stats: `${opsSummary?.safety.highOrCritical ?? 0} high/critical · ${opsSummary?.safety.emergencyNotTagged ?? 0} not tagged emergency`,
    },
  ];

  const sections = [
    {
      title: "Professionals",
      description: "Manage contractors, companies, and resellers. Edit profiles, approve/suspend accounts, view ratings.",
      href: "/admin/professionals",
      icon: "👷",
      stats: "View all professionals",
    },
    {
      title: "Users",
      description: "Manage client and admin accounts. Create new admin users, edit user details, remove accounts.",
      href: "/admin/users",
      icon: "👤",
      stats: "View all users",
    },
    {
      title: "Trades",
      description: "Manage trades catalogue, featured trades, and mapping to services.",
      href: "/admin/trades",
      icon: "🛠️",
      stats: "Manage trades",
    },
    {
      title: "Projects",
      description: "View all projects, track email notifications, monitor quote submissions and professional responses.",
      href: "/admin/projects",
      icon: "📋",
      stats: "View all projects",
    },
    {
      title: "Professional Reports",
      description: "Review client-submitted reports about professionals before sharing with the community.",
      href: "/admin/reports",
      icon: "🛠️",
      stats: `${outstandingReports} outstanding`,
    },
    {
      title: "Messaging",
      description: "Handle assist requests and support chat threads. Respond to client questions and manage communications.",
      href: "/admin/messaging",
      icon: "💬",
      stats: `${opsSummary?.assist.open ?? 0} open`,
    },
    {
      title: "Analytics",
      description: "Monitor approvals, projects, and engagement across the platform with quick-read metrics and trends.",
      href: "/admin/analytics",
      icon: "📈",
      stats: "View analytics",
    },
    {
      title: "Activity Log",
      description: "Audit trail of admin actions and bulk operations. Track who changed what and when.",
      href: "/admin/activity-log",
      icon: "📜",
      stats: "View activity",
    },
    {
      title: "Policies & Documents",
      description: "Manage Terms & Conditions, Security Statement, and Contract templates. Version control and document updates.",
      href: "/admin/policies",
      icon: "📄",
      stats: "Manage documents",
    },
    {
      title: "Home Ticker",
      description: "Manage public home-page ticker announcements and reuse previous messages.",
      href: "/admin/announcements",
      icon: "📢",
      stats: "Manage ticker text",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Updates Button */}
      <div className="flex justify-center">
        <UpdatesButton />
      </div>

      {/* Hero */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
          <h1 className="text-3xl font-bold">Welcome back{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          <p className="text-sm text-slate-200/90">Manage operations queues and core platform configuration.</p>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Operations Dashboard</h2>
        <p className="text-sm text-slate-600">Claim work from the active queues, then drill into full pages for execution.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {operations.map((item) => (
          <Link
            key={item.href + item.title}
            href={item.href}
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div className="flex items-start gap-4 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
              <div className="text-3xl">{item.icon}</div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{item.stats}</p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm text-slate-700">{item.description}</p>
              <p className="text-sm font-semibold text-emerald-700 group-hover:text-emerald-800 flex items-center gap-1">
                Open
                <span aria-hidden>→</span>
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Management</h2>
        <p className="text-sm text-slate-600">Deep-dive admin pages for records, settings, and reporting.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div className="flex items-start gap-4 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
              <div className="text-3xl">{section.icon}</div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{section.stats}</p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm text-slate-700">{section.description}</p>
              <p className="text-sm font-semibold text-emerald-700 group-hover:text-emerald-800 flex items-center gap-1">
                Open
                <span aria-hidden>→</span>
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="font-semibold text-amber-900">Admin Access</h3>
            <p className="mt-1 text-sm text-amber-800">
              You have full access to all platform data. Changes are permanent and affect live users. Use caution when
              deleting records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
