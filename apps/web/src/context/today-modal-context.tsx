'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { TodayModal, type DigestItem } from '@/components/today-modal';

const SEEN_KEY = 'today_seen';

type TodayModalContextValue = {
  isOpen: boolean;
  count: number;
  openToday: () => void;
  closeToday: () => void;
};

const TodayModalContext = createContext<TodayModalContextValue | null>(null);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TodayModalProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn: clientLoggedIn, accessToken: clientToken } = useAuth();
  const { isLoggedIn: proLoggedIn, accessToken: proToken } = useProfessionalAuth();

  const role: 'client' | 'professional' | null = proLoggedIn
    ? 'professional'
    : clientLoggedIn
      ? 'client'
      : null;
  const accessToken = proLoggedIn ? proToken : clientToken;

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<DigestItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const openToday = useCallback(() => setIsOpen(true), []);
  const closeToday = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!role || !accessToken) {
      setItems([]);
      setCount(0);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE_URL}/digest/today`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d?.items) ? (d.items as DigestItem[]) : [];
        setItems(list);
        setCount(list.length);

        // Auto-show once on login/day: always if opted in, else only when there
        // are actionable items and we haven't already shown it today.
        const alwaysShow = localStorage.getItem('today_always_show') === '1';
        const seen = localStorage.getItem(SEEN_KEY);
        if (alwaysShow || (list.length > 0 && seen !== todayKey())) {
          setIsOpen(true);
          localStorage.setItem(SEEN_KEY, todayKey());
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [role, accessToken]);

  const value = useMemo(
    () => ({ isOpen, count, openToday, closeToday }),
    [isOpen, count, openToday, closeToday],
  );

  return (
    <TodayModalContext.Provider value={value}>
      {children}
      <TodayModal
        open={isOpen}
        items={items}
        loading={loading}
        role={role}
        onClose={closeToday}
      />
    </TodayModalContext.Provider>
  );
}

export function useTodayModal(): TodayModalContextValue {
  const ctx = useContext(TodayModalContext);
  if (!ctx) throw new Error('useTodayModal must be used within TodayModalProvider');
  return ctx;
}
