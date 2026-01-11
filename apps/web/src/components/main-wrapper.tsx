'use client';

import { usePathname } from 'next/navigation';

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');

  // Admin pages manage their own layout completely
  if (isAdminPath) {
    return <>{children}</>;
  }

  // Regular pages get standard padding and max-width
  return <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>;
}
