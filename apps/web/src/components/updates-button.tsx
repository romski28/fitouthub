'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<UpdatesSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Pick a random inspirational message (stable per session)
  const inspirationalMessage = useMemo(() => {
    return INSPIRATIONAL_MESSAGES[Math.floor(Math.random() * INSPIRATIONAL_MESSAGES.length)];
  }, []);

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem('token');
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
      }
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();

    // Poll every 60 seconds
    const interval = setInterval(fetchSummary, 60000);

    return () => clearInterval(interval);
  }, []);

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
