'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './navbar';

export function NavbarWrapper() {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');
  const isGetStartedPath = pathname === '/get-started';

  // Don't render navbar on admin or get-started pages
  if (isAdminPath || isGetStartedPath) {
    return null;
  }

  return <Navbar />;
}
