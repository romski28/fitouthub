'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './navbar';

export function NavbarWrapper() {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');
  const isPmPath = pathname?.startsWith('/pm');
  const isGetStartedPath = pathname === '/get-started';

  // Don't render navbar on admin, pm, or get-started pages
  if (isAdminPath || isPmPath || isGetStartedPath) {
    return null;
  }

  return <Navbar />;
}
