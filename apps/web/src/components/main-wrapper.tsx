'use client';

import { usePathname } from 'next/navigation';

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');
  const isHomePath = pathname === '/';
  const isProjectsListPath = pathname === '/projects' || pathname === '/professional-projects';

  // Admin pages manage their own layout completely
  if (isAdminPath) {
    return <>{children}</>;
  }

  if (isProjectsListPath) {
    return <main className="w-full px-0 py-6">{children}</main>;
  }

  // Regular pages get standard padding and max-width
  return (
    <main className={isHomePath ? 'mx-auto max-w-6xl px-6 pb-10' : 'mx-auto max-w-6xl px-6 py-10'}>
      {children}
    </main>
  );
}
