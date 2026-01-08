'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
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

  // Use whichever token is available
  const token = clientToken || profToken;

  // Pick a random inspirational message (stable per session)
  const inspirationalMessage = useMemo(() => {
    return INSPIRATIONAL_MESSAGES[Math.floor(Math.random() * INSPIRATIONAL_MESSAGES.length)];
  }, []);

  const fetchSummary = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/updates/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSummary({
          totalCount: data.totalCount,
          financialCount: data.financialCount,
          unreadCount: data.unreadCount,
        });
      } else {
        console.error('Failed to fetch updates:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetchSummary();

    // Poll every 60 seconds
    const interval = setInterval(fetchSummary, 60000);

    return () => clearInterval(interval);
  }, [token]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    // Refresh on close to update counts
    fetchSummary();
  };

  if (loading || !summary) {
    return null;
  }

  const hasUpdates = summary.totalCount > 0;

  return (
    <>
      <button
        onClick={handleOpen}
        className={`relative inline-flex items-center gap-3 px-6 py-3 ${
          hasUpdates
            ? 'bg-action text-white hover:bg-action-hover'
            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
        } font-medium rounded-lg transition-colors shadow-sm ${className}`}
      >
        <span className="text-lg">{hasUpdates ? '🔔' : '✨'}</span>
        <span>
          {hasUpdates ? (
            <>
              You have {summary.totalCount} {summary.totalCount === 1 ? 'update' : 'updates'}
            </>
          ) : (
            inspirationalMessage
          )}
        </span>
        {hasUpdates && (
          <span className="flex items-center justify-center min-w-[24px] h-6 px-2 bg-white text-action rounded-full text-sm font-bold">
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
