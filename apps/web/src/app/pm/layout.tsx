"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useAuthModalControl } from "@/context/auth-modal-control";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function PmLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, user, logout } = useAuth();
  const { openLoginModal } = useAuthModalControl();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close the profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = () => setProfileMenuOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [profileMenuOpen]);

  const showAuthed = mounted && isLoggedIn && user;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Minimal PM header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand */}
          <Link href="/pm" className="text-lg font-bold text-slate-900">
            PM Portal
          </Link>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />

            {showAuthed ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <span>{user.nickname}</span>
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    <Link
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        logout();
                        router.push("/");
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-slate-50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
