import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

/**
 * Hook to determine if project funds are secured (escrow confirmed).
 * Fetches financial summary and checks if escrowConfirmed > 0.
 */
export function useFundsSecured(projectId: string | undefined, accessToken: string | undefined): boolean {
  const [fundsSecured, setFundsSecured] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        if (!projectId || !accessToken) {
          setFundsSecured(false);
          return;
        }
        const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setFundsSecured(false);
          return;
        }
        const summary = await res.json();
        const confirmedVal = summary?.escrowConfirmed;
        const confirmedNum = typeof confirmedVal === 'string' ? parseFloat(confirmedVal) : Number(confirmedVal || 0);
        setFundsSecured(confirmedNum > 0);
      } catch {
        setFundsSecured(false);
      }
    };
    loadSummary();
  }, [projectId, accessToken]);

  return fundsSecured;
}
