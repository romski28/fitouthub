'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './navbar';

export function NavbarWrapper() {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');

  // Don't render navbar on admin pages
  if (isAdminPath) {
    return null;
  }

  return <Navbar />;
}
