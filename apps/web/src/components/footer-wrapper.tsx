'use client';

import { usePathname } from 'next/navigation';
import Footer from './footer';

export function FooterWrapper() {
  const pathname = usePathname();
  const hide = pathname?.startsWith('/admin') || pathname?.startsWith('/pm') || pathname === '/get-started';

  if (hide) return null;

  return <Footer />;
}
