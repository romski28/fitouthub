'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { colors, radii, shadows } from '@/styles/theme';
import { UpdatesModal } from './updates-modal';

interface UpdatesButtonProps {
  className?: string;
}

interface UpdatesSummary {
  totalCount: number;
  financialCount: number;
  unreadCount: number;
}

const INSPIRATIONAL_MESSAGES = [
  "You're all caught up! Start something great today! 🚀",
  "Nothing pending! Time to make magic happen! ✨",
  "All clear! Ready to build something amazing? 💪",
  "You're on top of everything! Let's create! 🎨",
  "Inbox zero! Time to turn ideas into reality! 💡",
  "All done! Your next big project awaits! 🌟",
];

export function UpdatesButton({ className = '' }: UpdatesButtonProps) {
  const { accessToken: clientToken, isLoggedIn } = useAuth();
  const { accessToken: profToken, isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<UpdatesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Use whichever token is available
  const token = clientToken || profToken;

  // Pick a random inspirational message (stable per session)
  const inspirationalMessage = useMemo(() => {
    return INSPIRATIONAL_MESSAGES[Math.floor(Math.random() * INSPIRATIONAL_MESSAGES.length)];
  }, []);

  const fetchSummary = async () => {
    if (!token) {
      console.log('No token available, skipping fetch');
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching updates summary...');
      const response = await fetch(`${API_BASE_URL}/updates/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Updates summary fetched:', data);
        setSummary({
          totalCount: data.totalCount,
          financialCount: data.financialCount,
          unreadCount: data.unreadCount,
        });
      } else {
        console.error('Failed to fetch updates:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    } finally {
      setLoading(false);
    }
  };

  // Hydration check
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      console.log('Waiting for token...');
      return;
    }

    console.log('Token available, fetching updates');
    fetchSummary();

    // Poll every 60 seconds
    const interval = setInterval(fetchSummary, 60000);

    return () => clearInterval(interval);
  }, [token, hydrated]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    // Refresh on close to update counts
    fetchSummary();
  };

  // Don't render until hydrated
  if (!hydrated) {
    return null;
  }

  // Don't render if not logged in
  if (!isLoggedIn && !profIsLoggedIn) {
    return null;
  }

  // Show loading state or inspirational message while fetching
  const hasUpdates = summary && summary.totalCount > 0;

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          backgroundColor: hasUpdates ? colors.primary : colors.successBg,
          color: hasUpdates ? colors.background : colors.success,
          borderColor: !hasUpdates ? colors.success : undefined,
        }}
        className={`relative inline-flex items-center gap-3 px-6 py-3 ${
          !hasUpdates ? 'border' : ''
        } font-medium ${radii.md} transition-opacity hover:opacity-90 ${shadows.subtle} ${className}`}
      >
        <span className="text-lg">{hasUpdates ? '🔔' : '✨'}</span>
        <span>
          {loading && !summary ? (
            'Loading...'
          ) : hasUpdates ? (
            <>
              You have {summary.totalCount} {summary.totalCount === 1 ? 'update' : 'updates'}
            </>
          ) : (
            inspirationalMessage
          )}
        </span>
        {hasUpdates && (
          <span
            style={{
              backgroundColor: colors.background,
              color: colors.primary,
            }}
            className="flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-sm font-bold"
          >
            {summary.totalCount}
          </span>
        )}
      </button>

      <UpdatesModal
        isOpen={isOpen}
        onClose={handleClose}
        onRefresh={fetchSummary}
      />
    </>
  );
}
