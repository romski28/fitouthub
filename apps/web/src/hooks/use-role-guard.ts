import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';

type Role = 'admin' | 'client' | 'professional';

interface Options {
  fallback?: string;
}

/**
 * Redirects to fallback if current role is not allowed.
 * - Uses auth-context for client/admin
 * - Uses professional-auth-context for pro role tokens
 */
export function useRoleGuard(allowed: Role[], { fallback = '/' }: Options = {}) {
  const router = useRouter();
  const { role: clientRole, isLoggedIn } = useAuth();
  const { isLoggedIn: proLoggedIn } = useProfessionalAuth();

  useEffect(() => {
    // Wait until auth states are resolved
    if (isLoggedIn === undefined) return;

    const currentRole: Role | null = clientRole === 'admin' || clientRole === 'client' ? (clientRole as Role) : null;
    const proRole: Role | null = proLoggedIn ? 'professional' : null;
    const role = currentRole ?? proRole;

    // Not logged in: leave to caller
    if (!role) return;

    if (!allowed.includes(role)) {
      router.replace(fallback);
    }
  }, [allowed, clientRole, proLoggedIn, isLoggedIn, router, fallback]);
}
