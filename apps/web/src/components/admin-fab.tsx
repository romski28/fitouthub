'use client';

import { useAuth } from '@/context/auth-context';
import { usePathname, useRouter } from 'next/navigation';

export function AdminFab() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (user?.role !== 'admin') return null;

  const isInAdmin = pathname?.startsWith('/admin');

  return (
    <button
      type="button"
      onClick={() => router.push(isInAdmin ? '/' : '/admin')}
      title={isInAdmin ? 'Back to platform' : 'Open admin panel'}
      className="fixed right-4 top-24 z-50 flex items-center gap-2 rounded-full bg-[#F97362] px-4 py-2 text-sm font-semibold text-[#F5EEDE] shadow-lg ring-1 ring-[#F97362]/30 transition hover:bg-[#e8624f] active:scale-95"
    >
      {isInAdmin ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 12l6-6m-6 6l6 6" />
          </svg>
          Platform
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Admin
        </>
      )}
    </button>
  );
}
