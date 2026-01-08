'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const showAuthed = hydrated && isLoggedIn && user;
  const showProfessionalAuthed = hydrated && profIsLoggedIn && professional;
  const isAdmin = Boolean(user && user.role === 'admin');
  const showProjectsLink = hydrated && isLoggedIn;
  const showProfessionalProjectsLink = hydrated && profIsLoggedIn;

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition"
          >
            <Image
              src="/FOHLogo.png"
              alt="Fitout Hub"
              width={40}
              height={40}
              className="object-contain"
            />
            <span className="text-lg font-semibold tracking-tight hidden sm:inline">
              Fitout Hub
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700">
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
              <a className="hover:text-slate-900" href="/projects">
                My Projects
              </a>
            ) : null}
            {showProfessionalProjectsLink ? (
              <a className="hover:text-slate-900" href="/professional-projects">
                My Projects
              </a>
            ) : null}

            {/* Desktop Auth buttons */}
            <div className="ml-4 flex items-center gap-3 border-l border-slate-200 pl-6">
              {showAuthed ? (
                <div className="relative">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-slate-100"
                  >
                    <span className="text-slate-900 font-medium">{user.nickname}</span>
                    {isAdmin ? (
                      <Link
                        href="/admin"
                        className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded border border-amber-200 font-semibold"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Admin Portal
                      </Link>
                    ) : (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {user.role}
                      </span>
                    )}
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
                        href="/professional/profile"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Profile
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

          {/* Mobile Auth & Hamburger */}
          <div className="md:hidden flex items-center gap-3">
            {/* Auth buttons on mobile */}
            {showAuthed ? (
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="text-slate-900 font-medium text-sm hover:bg-slate-100 px-2 py-1 rounded max-w-[120px] truncate"
              >
                {user.nickname}
              </button>
            ) : showProfessionalAuthed ? (
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="text-slate-900 font-medium text-sm hover:bg-slate-100 px-2 py-1 rounded max-w-[120px] truncate"
              >
                {professional.fullName?.split(' ')[0] || 'Pro'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={openLoginModal}
                  className="text-slate-700 hover:text-slate-900 font-medium text-sm"
                >
                  Login
                </button>
                <button
                  onClick={openJoinModal}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-white font-medium text-sm hover:bg-blue-700"
                >
                  Join
                </button>
              </div>
            )}

            {/* Hamburger menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md hover:bg-slate-100"
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

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-slate-50">
            <nav className="flex flex-col px-4 py-3 space-y-2 text-sm font-medium text-slate-700">
              <a
                className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                href="/tradesmen"
                onClick={() => setMobileMenuOpen(false)}
              >
                Tradesmen
              </a>
              <a
                className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                href="/professionals"
                onClick={() => setMobileMenuOpen(false)}
              >
                Professionals
              </a>
              <a
                className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                href="/docs"
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </a>
              {showProjectsLink ? (
                <a
                  className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                  href="/projects"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  My Projects
                </a>
              ) : null}
              {showProfessionalProjectsLink ? (
                <a
                  className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                  href="/professional-projects"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  My Projects
                </a>
              ) : null}

              {/* Mobile profile menu */}
              {showAuthed && (
                <>
                  <hr className="my-2" />
                  <a
                    href="/profile"
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Profile
                  </a>
                  {user.role === 'admin' ? (
                    <Link
                      href="/admin"
                      className="px-3 py-2 rounded hover:bg-slate-100 text-amber-800 font-semibold"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Admin Portal
                    </Link>
                  ) : null}
                  {user.role === 'professional' && (
                    <a
                      href="/professional/edit"
                      className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Edit Professional Info
                    </a>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                      router.push('/');
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 text-red-600"
                  >
                    Logout
                  </button>
                </>
              )}

              {showProfessionalAuthed && (
                <>
                  <hr className="my-2" />
                  <a
                    href="/professional/profile"
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Profile
                  </a>
                  <button
                    onClick={() => {
                      profLogout();
                      setMobileMenuOpen(false);
                      router.push('/');
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 text-red-600"
                  >
                    Logout
                  </button>
                </>
              )}
            </nav>
          </div>
        )}

        {/* Mobile Profile Dropdown */}
        {profileMenuOpen && (showAuthed || showProfessionalAuthed) && mobileMenuOpen === false && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-3 space-y-2 text-sm font-medium text-slate-700">
              {showAuthed && (
                <>
                  <a
                    href="/profile"
                    className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Profile
                  </a>
                  {user.role === 'admin' ? (
                    <Link
                      href="/admin"
                      className="block px-3 py-2 rounded hover:bg-slate-50 text-amber-800 font-semibold"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      Admin Portal
                    </Link>
                  ) : null}
                  {user.role === 'professional' && (
                    <a
                      href="/professional/edit"
                      className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                      onClick={() => setProfileMenuOpen(false)}
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
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-red-600"
                  >
                    Logout
                  </button>
                </>
              )}

              {showProfessionalAuthed && (
                <>
                  <a
                    href="/professional/profile"
                    className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Profile
                  </a>
                  <button
                    onClick={() => {
                      profLogout();
                      setProfileMenuOpen(false);
                      router.push('/');
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-red-600"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
};
