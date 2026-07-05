'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { clearAiClientState } from '@/lib/client-session';
import { LanguageSwitcher } from './language-switcher';
import { EmergencyModal } from './emergency-modal';

export const Navbar: React.FC = () => {
  const t = useTranslations('nav');
  const { isLoggedIn, user, logout } = useAuth();
  const {
    isLoggedIn: profIsLoggedIn,
    professional,
    logout: profLogout,
  } = useProfessionalAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setHydrated(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    setNavVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setHasScrolled(currentScrollY > 8);

      if (mobileMenuOpen || profileMenuOpen) {
        setNavVisible(true);
        lastScrollY = currentScrollY;
        return;
      }

      if (currentScrollY <= 24) {
        setNavVisible(true);
        lastScrollY = currentScrollY;
        return;
      }

      const delta = currentScrollY - lastScrollY;
      if (delta > 10) {
        setNavVisible(false);
      } else if (delta < -10) {
        setNavVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hydrated, mobileMenuOpen, profileMenuOpen]);

  const showAuthed = hydrated && isLoggedIn && user;
  const showProfessionalAuthed = hydrated && profIsLoggedIn && professional;
  const isAdmin = Boolean(user && user.role === 'admin');
  const showProjectsLink = hydrated && isLoggedIn && !profIsLoggedIn;
  const showProfessionalProjectsLink = hydrated && profIsLoggedIn;
  const showPublicLinks = !showProfessionalAuthed;
  const navShellClassName = [
    'sticky top-0 z-40 border-b border-slate-200/80 bg-white/78 backdrop-blur-md transition-transform duration-300',
    navVisible ? 'translate-y-0' : '-translate-y-full',
    hasScrolled ? 'shadow-[0_10px_30px_rgba(15,23,42,0.08)]' : 'shadow-sm',
  ].join(' ');

  return (
    <>
      <header className={navShellClassName}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
          {/* Logo */}
          <Link
            href="/"
            onClick={() => clearAiClientState()}
            className="flex items-center hover:opacity-80 transition"
          >
            <Image
              src="/assets/lockup-horizontal-ink.webp"
              alt="Mimo"
              width={172}
              height={44}
              className="h-7 sm:h-[44px] w-auto object-contain"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden min-[820px]:flex items-center gap-6 text-sm font-medium text-slate-700">
            {showPublicLinks ? (
              <>
                <Link className="hover:text-slate-900" href="/professionals">
                  {t('professionals')}
                </Link>
              </>
            ) : null}
            <Link className="hover:text-slate-900" href="/about">
              {t('about')}
            </Link>
            <Link className="hover:text-slate-900" href="/docs">
              {t('docs')}
            </Link>
            {showProjectsLink ? (
              <Link className="hover:text-slate-900" href="/projects">
                {t('projects')}
              </Link>
            ) : null}
            {showProfessionalProjectsLink ? (
              <>
                <Link className="hover:text-slate-900" href="/professional-projects">
                  {t('projects')}
                </Link>
                <Link className="hover:text-slate-900" href="/professional/calendar">
                  Calendar
                </Link>
              </>
            ) : null}

            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* SOS — emergency for clients */}
            {showAuthed && user?.role === 'client' && (
              <button
                onClick={() => setEmergencyOpen(true)}
                className="text-sm font-black tracking-[0.25em] text-[#DC143C] uppercase hover:text-[#b01030] transition"
                title="Emergency help"
              >
                SOS
              </button>
            )}

            {/* Desktop Auth buttons */}
            <div className="ml-4 flex min-w-[220px] items-center justify-end gap-3 border-l border-slate-200 pl-6">
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
                      <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        {t('profile')}
                      </Link>
                      {user.role === 'professional' && (
                        <Link
                          href="/professional/edit"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setProfileMenuOpen(false)}
                        >
                          {t('editProfessional')}
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          logout();
                          setProfileMenuOpen(false);
                          router.push('/');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                      >
                        {t('logout')}
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
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      {t('professional')}
                    </span>
                  </button>

                  {/* Professional Profile dropdown menu */}
                  {profileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-50">
                      <Link
                        href="/professional/profile"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        {t('profile')}
                      </Link>
                      <Link
                        href="/professional/portfolio"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        Portfolio
                      </Link>
                      <Link
                        href="/professional/certifications"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        Certifications
                      </Link>
                      <button
                        onClick={() => {
                          profLogout();
                          setProfileMenuOpen(false);
                          router.push('/');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                      >
                        {t('logout')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Keep button container stable to avoid hydration diffs
                <div className="flex min-h-10 items-center gap-3">
                  <button
                    onClick={openLoginModal}
                    className="text-slate-700 hover:text-slate-900 font-medium"
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={openJoinModal}
                    className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
                  >
                    {t('join')}
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* Mobile Auth & Hamburger */}
          <div className="flex min-w-[152px] items-center justify-end gap-3 min-[820px]:hidden">
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
                  {t('login')}
                </button>
                <button
                  onClick={openJoinModal}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-white font-medium text-sm hover:bg-blue-700"
                >
                  {t('join')}
                </button>
              </div>
            )}

            <LanguageSwitcher />

            {/* Hamburger menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md hover:bg-slate-100"
              aria-label={t('toggleMenu')}
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
          <div className="min-[820px]:hidden border-t border-slate-200 bg-slate-50">
            <nav className="flex flex-col px-4 py-3 space-y-2 text-sm font-medium text-slate-700">
              {/* SOS — mobile emergency */}
              {showAuthed && user?.role === 'client' && (
                <button
                  onClick={() => { setEmergencyOpen(true); setMobileMenuOpen(false); }}
                  className="px-3 py-2 rounded text-left text-[#DC143C] font-black tracking-[0.25em] uppercase hover:bg-red-50"
                >
                  SOS
                </button>
              )}
              {showPublicLinks ? (
                <>
                  <Link
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    href="/professionals"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('professionals')}
                  </Link>
                </>
              ) : null}
              <Link
                className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                href="/about"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('about')}
              </Link>
              <Link
                className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                href="/docs"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('docs')}
              </Link>
              {showProjectsLink ? (
                <Link
                  className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                  href="/projects"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('projects')}
                </Link>
              ) : null}
              {showProfessionalProjectsLink ? (
                <>
                  <Link
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    href="/professional-projects"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('projects')}
                  </Link>
                  <Link
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    href="/professional/calendar"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Calendar
                  </Link>
                </>
              ) : null}

              {/* Mobile profile menu */}
              {showAuthed && (
                <>
                  <hr className="my-2" />
                  <Link
                    href="/profile"
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('profile')}
                  </Link>
                  {user.role === 'admin' ? (
                    <Link
                      href="/admin"
                      className="px-3 py-2 rounded hover:bg-slate-100 text-amber-800 font-semibold"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t('adminPortal')}
                    </Link>
                  ) : null}
                  {user.role === 'professional' && (
                    <Link
                      href="/professional/edit"
                      className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t('editProfessional')}
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                      router.push('/');
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 text-red-600"
                  >
                    {t('logout')}
                  </button>
                </>
              )}

              {showProfessionalAuthed && (
                <>
                  <hr className="my-2" />
                  <Link
                    href="/professional/profile"
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('profile')}
                  </Link>
                  <Link
                    href="/professional/portfolio"
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Portfolio
                  </Link>
                  <Link
                    href="/professional/calendar"
                    className="px-3 py-2 rounded hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Calendar
                  </Link>
                  <button
                    onClick={() => {
                      profLogout();
                      setMobileMenuOpen(false);
                      router.push('/');
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 text-red-600"
                  >
                    {t('logout')}
                  </button>
                </>
              )}
            </nav>
          </div>
        )}

        {/* Mobile Profile Dropdown */}
        {profileMenuOpen && (showAuthed || showProfessionalAuthed) && mobileMenuOpen === false && (
          <div className="min-[820px]:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-3 space-y-2 text-sm font-medium text-slate-700">
              {showAuthed && (
                <>
                  <Link
                    href="/profile"
                    className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Profile
                  </Link>
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
                    <Link
                      href="/professional/edit"
                      className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      Edit Professional Info
                    </Link>
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
                  <Link
                    href="/professional/profile"
                    className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/professional/portfolio"
                    className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Portfolio
                  </Link>
                  <Link
                    href="/professional/certifications"
                    className="block px-3 py-2 rounded hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Certifications
                  </Link>
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
      <EmergencyModal isOpen={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </>
  );
};
