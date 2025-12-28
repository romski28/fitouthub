'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { useAuthModalControl } from '@/context/auth-modal-control';

export const Navbar: React.FC = () => {
  const { isLoggedIn, user, accessToken, logout } = useAuth();
  const {
    isLoggedIn: profIsLoggedIn,
    professional,
    accessToken: professionalAccessToken,
    logout: profLogout,
  } = useProfessionalAuth();
  const router = useRouter();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const showAuthed = hydrated && isLoggedIn && user;
  const showProfessionalAuthed = hydrated && profIsLoggedIn && professional;
  const showProjectsLink = hydrated && isLoggedIn;
  const [clientUnread, setClientUnread] = useState<number>(0);
  const [profUnread, setProfUnread] = useState<number>(0);
  const [disableClientUnread, setDisableClientUnread] = useState<boolean>(false);
  const [disableProfUnread, setDisableProfUnread] = useState<boolean>(false);

  useEffect(() => {
    if (!hydrated) return;
    
    // Only fetch if we have a token and haven't disabled
    if (isLoggedIn && accessToken && accessToken.length > 10 && !disableClientUnread) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      fetch(`${API_BASE_URL}/client/messages/unread-count`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
        .then((r) => {
          if (!r || r.status === 401 || r.status === 403) {
            setDisableClientUnread(true);
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((data) => {
          if (data?.unreadCount !== undefined) setClientUnread(data.unreadCount);
        })
        .catch((err) => {
          // Silently disable on error - don't spam console
          if (err?.name !== 'AbortError') {
            setDisableClientUnread(true);
          }
        })
        .finally(() => clearTimeout(timeoutId));
    }
    
    if (profIsLoggedIn && professionalAccessToken && professionalAccessToken.length > 10 && !disableProfUnread) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      fetch(`${API_BASE_URL}/professional/messages/unread-count`, {
        headers: { Authorization: `Bearer ${professionalAccessToken}` },
        signal: controller.signal,
      })
        .then((r) => {
          if (!r || r.status === 401 || r.status === 403) {
            setDisableProfUnread(true);
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((data) => {
          if (data?.unreadCount !== undefined) setProfUnread(data.unreadCount);
        })
        .catch((err) => {
          // Silently disable on error - don't spam console
          if (err?.name !== 'AbortError') {
            setDisableProfUnread(true);
          }
        })
        .finally(() => clearTimeout(timeoutId));
    }
  }, [hydrated, isLoggedIn, accessToken, profIsLoggedIn, professionalAccessToken, disableClientUnread, disableProfUnread]);

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight hover:text-slate-600 transition"
          >
            Fitout Hub
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-700">
            <a className="hover:text-slate-900" href="/tradesmen">
              Tradesmen
            </a>
            <a className="hover:text-slate-900" href="/professionals">
              Professionals
            </a>
            <a className="hover:text-slate-900" href="/docs">
              Docs
            </a>
            {showProjectsLink ? (
              <a className="relative hover:text-slate-900" href="/projects">
                Projects
                {clientUnread > 0 && (
                  <span className="absolute -top-2 -right-3 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs">
                    {clientUnread}
                  </span>
                )}
              </a>
            ) : null}

            {/* Auth buttons */}
            <div className="ml-4 flex items-center gap-3 border-l border-slate-200 pl-6">
              {showAuthed ? (
                <div className="relative">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-slate-100"
                  >
                    <span className="text-slate-900 font-medium">{user.nickname}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {user.role}
                    </span>
                  </button>

                  {/* Profile dropdown menu */}
                  {profileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-50">
                      <a
                        href="/profile"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Profile
                      </a>
                      {user.role === 'professional' && (
                        <a
                          href="/professional/edit"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Edit Professional Info
                        </a>
                      )}
                      <button
                        onClick={() => {
                          logout();
                          setProfileMenuOpen(false);
                          router.push('/');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : showProfessionalAuthed ? (
                <div className="relative">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-slate-100"
                  >
                    <span className="text-slate-900 font-medium">{professional.fullName || professional.email}</span>
                    <span className="relative text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      Professional
                      {profUnread > 0 && (
                        <span className="absolute -top-2 -right-2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px]">
                          {profUnread}
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Professional Profile dropdown menu */}
                  {profileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-50">
                      <a
                        href="/professional-projects"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        My Projects
                      </a>
                      <button
                        onClick={() => {
                          profLogout();
                          setProfileMenuOpen(false);
                          router.push('/');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Keep button container stable to avoid hydration diffs
                <div className="flex items-center gap-3">
                  <button
                    onClick={openLoginModal}
                    className="text-slate-700 hover:text-slate-900 font-medium"
                  >
                    Login
                  </button>
                  <button
                    onClick={openJoinModal}
                    className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
                  >
                    Join
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
    </>
  );
};
