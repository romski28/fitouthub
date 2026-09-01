'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';

interface BookPmCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  accessToken: string;
}

type AvailabilitySlot = { startsAt: string; endsAt: string };

const formatSlot = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-HK', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  });
};

export default function BookPmCallModal({
  isOpen,
  onClose,
  projectId,
  accessToken,
}: BookPmCallModalProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailability = useCallback(
    async (cursor?: string, direction: 'reset' | 'next' | 'back' = 'reset') => {
      if (!accessToken || !projectId || !isOpen) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        const res = await fetch(
          `${API_BASE_URL}/projects/${projectId}/pm-call/availability?${params.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Unable to load call availability');
        }
        const data = await res.json();
        setSlots(data.slots || []);
        setNextCursor(data.nextCursor || null);
        if (direction === 'next' && cursor) setCursorHistory((prev) => [...prev, cursor]);
        if (direction === 'back') setCursorHistory((prev) => prev.slice(0, -1));
        if (direction === 'reset') setCursorHistory([]);
        setSelectedSlotStart((data.slots || []).length > 0 ? data.slots[0].startsAt : '');
      } catch (err) {
        setSlots([]);
        setError(err instanceof Error ? err.message : 'Unable to load call availability');
      } finally {
        setLoading(false);
      }
    },
    [accessToken, projectId, isOpen],
  );

  useEffect(() => {
    if (!isOpen) {
      setSlots([]);
      setSelectedSlotStart('');
      setNextCursor(null);
      setCursorHistory([]);
      setError(null);
      return;
    }
    void fetchAvailability(undefined, 'reset');
  }, [fetchAvailability, isOpen]);

  const handleBook = async () => {
    if (!accessToken || !projectId || !selectedSlotStart) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-call/book`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedDate: selectedSlotStart }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Unable to book call');
      }
      toast.success('Call booked with your PM');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book call');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-slate-900">Book a call with your PM</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick an available time slot to speak with your Project Manager.
        </p>

        {error ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Available slots (from tomorrow)</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const prev = cursorHistory[cursorHistory.length - 2];
                if (loading || submitting) return;
                if (cursorHistory.length <= 1) {
                  void fetchAvailability(undefined, 'reset');
                  return;
                }
                if (prev) void fetchAvailability(prev, 'back');
              }}
              disabled={loading || submitting || cursorHistory.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (!nextCursor || loading || submitting) return;
                void fetchAvailability(nextCursor, 'next');
              }}
              disabled={!nextCursor || loading || submitting}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              {loading ? 'Loading…' : 'Next 5'}
            </button>
          </div>
        </div>

        {slots.length > 0 ? (
          <div className="mt-2 grid gap-2">
            {slots.map((slot) => {
              const isSelected = selectedSlotStart === slot.startsAt;
              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => setSelectedSlotStart(slot.startsAt)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {formatSlot(slot.startsAt)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            {loading ? 'Loading slots…' : 'No available slots found.'}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBook}
            disabled={submitting || !selectedSlotStart}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Booking…' : 'Book call'}
          </button>
        </div>
      </div>
    </div>
  );
}
