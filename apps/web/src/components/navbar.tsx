'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { AuthModal } from '@/components/auth-modal';

export const Navbar: React.FC = () => {
  const { isLoggedIn, user, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'join'>('login');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

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
            {/* Projects only visible when logged in */}
            {isLoggedIn && (
              <a className="hover:text-slate-900" href="/projects">
                Projects
              </a>
            )}

            {/* Auth buttons */}
            <div className="ml-4 flex items-center gap-3 border-l border-slate-200 pl-6">
              {isLoggedIn && user ? (
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
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setAuthModalTab('login');
                      setAuthModalOpen(true);
                    }}
                    className="text-slate-700 hover:text-slate-900"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalTab('join');
                      setAuthModalOpen(true);
                    }}
                    className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
                  >
                    Join
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authModalTab}
      />
    </>
  );
};
