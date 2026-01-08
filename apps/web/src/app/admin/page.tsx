"use client";

import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { UpdatesButton } from "@/components/updates-button";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [outstandingReports, setOutstandingReports] = useState<number>(0);
  const [openAssist, setOpenAssist] = useState<number>(0);

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
    const fetchAssistOpen = async () => {
      try {
        const url = `${API_BASE_URL.replace(/\/$/, '')}/assist-requests?status=open&limit=1`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setOpenAssist(Number(data?.total || 0));
        }
      } catch {}
    };
    fetchAssistOpen();
  }, []);

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
      title: "Pattern Matching",
      description: "Configure service mappings, location patterns, and trade synonyms for intelligent professional matching.",
      href: "/admin/patterns",
      icon: "🔍",
      stats: "Configure patterns",
    },
    {
      title: "Professional Reports",
      description: "Review client-submitted reports about professionals before sharing with the community.",
      href: "/admin/reports",
      icon: "🛠️",
      stats: `${outstandingReports} outstanding`,
    },
    {
      title: "Assist Requests",
      description: "Projects requesting FOH assistance. Review notes, message the client, and track progress.",
      href: "/admin/assist",
      icon: "🤝",
      stats: `${openAssist} open`,
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
          <p className="text-sm text-slate-200/90">Manage all platform data and configurations.</p>
        </div>
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
