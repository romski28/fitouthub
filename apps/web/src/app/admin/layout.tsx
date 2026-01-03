"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isLoggedIn !== undefined && (!user || user.role !== "admin")) {
      router.push("/");
    }
  }, [user, isLoggedIn, router, mounted]);

  if (!mounted || isLoggedIn === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/admin" className="text-xl font-bold text-slate-900">
                Admin Portal
              </Link>
              <div className="flex gap-4">
                <Link
                  href="/admin/professionals"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Professionals
                </Link>
                <Link
                  href="/admin/users"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Users
                </Link>
                <Link
                  href="/admin/projects"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Projects
                </Link>
                <Link
                  href="/admin/foh-inbox"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Support Inbox
                </Link>
                <Link
                  href="/admin/trades"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Trades
                </Link>
                <Link
                  href="/admin/patterns"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Patterns
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                {user.firstName} {user.surname}
              </span>
              <Link
                href="/"
                className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Exit Admin
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
