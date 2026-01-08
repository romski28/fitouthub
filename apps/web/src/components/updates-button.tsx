'use client';

import { useState, useEffect } from 'react';
import { UpdatesModal } from './updates-modal';

interface UpdatesButtonProps {
  className?: string;
}

interface UpdatesSummary {
  totalCount: number;
  financialCount: number;
  unreadCount: number;
}

export function UpdatesButton({ className = '' }: UpdatesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<UpdatesSummary | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading || !summary || summary.totalCount === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className={`relative inline-flex items-center gap-3 px-6 py-3 bg-action text-white font-medium rounded-lg hover:bg-action-hover transition-colors shadow-sm ${className}`}
      >
        <span className="text-lg">🔔</span>
        <span>
          You have {summary.totalCount} {summary.totalCount === 1 ? 'update' : 'updates'}
        </span>
        <span className="flex items-center justify-center min-w-[24px] h-6 px-2 bg-white text-action rounded-full text-sm font-bold">
          {summary.totalCount}
        </span>
      </button>

      <UpdatesModal
        isOpen={isOpen}
        onClose={handleClose}
        onRefresh={fetchSummary}
      />
    </>
  );
}
