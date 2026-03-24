"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

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
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      <nav className="flex-none border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/admin" className="text-xl font-bold text-slate-900">
              Admin Portal
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <div className="flex gap-4">
                <Link
                  href="/admin?tab=dashboard"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin?tab=messaging"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Messaging
                </Link>
                <Link
                  href="/admin?tab=data-control"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Data Control
                </Link>
                <Link
                  href="/admin?tab=analytics"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  Analytics
                </Link>
              </div>
              <div className="relative border-l border-slate-200 pl-6">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {user.firstName} {user.surname}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg z-20">
                    <Link
                      href="/admin/profile"
                      className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        logout();
                        router.push("/");
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="md:hidden flex items-center gap-3">
              <span className="text-sm text-slate-600 font-medium">{user.firstName}</span>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md hover:bg-slate-100"
                aria-label="Toggle menu"
              >
                <svg
                  className="w-6 h-6 text-slate-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {mobileMenuOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-slate-50">
            <div className="px-4 py-3 space-y-2">
              <Link
                href="/admin?tab=dashboard"
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                href="/admin?tab=messaging"
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Messaging
              </Link>
              <Link
                href="/admin?tab=data-control"
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Data Control
              </Link>
              <Link
                href="/admin?tab=analytics"
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Analytics
              </Link>
              <Link
                href="/admin/profile"
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Profile
              </Link>
              <hr className="my-2" />
              <button
                onClick={() => {
                  logout();
                  router.push("/");
                }}
                className="block w-full text-left rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
