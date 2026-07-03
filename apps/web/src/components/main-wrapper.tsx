'use client';

import { usePathname } from 'next/navigation';

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');
  const isHomePath = pathname === '/';
  const isProjectsListPath = pathname === '/projects' || pathname === '/professional-projects';
  const isGetStartedPath = pathname === '/get-started';
  const isCreateProjectWizardPath = pathname?.startsWith('/create-project/wizard');

  // Admin and get-started pages manage their own layout completely
  if (isAdminPath || isGetStartedPath) {
    return <>{children}</>;
  }

  if (isProjectsListPath) {
    return <main className="w-full px-0 py-6">{children}</main>;
  }

  if (isCreateProjectWizardPath) {
    return <main className="mx-auto max-w-6xl px-6 py-2">{children}</main>;
  }

  // Regular pages get standard padding and max-width
  return (
    <main className={isHomePath ? 'flex-1 flex items-center justify-center mx-auto w-full max-w-6xl px-6 pb-10' : 'flex-1 mx-auto max-w-6xl px-6 py-10'}>
      {children}
    </main>
  );
}
