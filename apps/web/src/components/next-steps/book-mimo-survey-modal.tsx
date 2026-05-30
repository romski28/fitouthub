'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { resolveNextStepModalContent } from '@/lib/next-step-modal-content';

interface BookMimoSurveyModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

const FEE_PER_ROOM_HKD = 500;

type AvailabilitySlot = {
  startsAt: string;
  endsAt: string;
};

type AvailabilityResponse = {
  rooms: number;
  durationMinutes: number;
  timezone: string;
  slots: AvailabilitySlot[];
  nextCursor: string | null;
};

const formatSlotDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-HK', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  });
};

const formatSlotTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  });
};

const formatDuration = (durationMinutes: number) => {
  if (!durationMinutes) return 'Not set';
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

export function BookMimoSurveyModal({
  isOpen,
  isLoading = false,
  onClose,
}: BookMimoSurveyModalProps) {
  const { accessToken } = useAuth();
  const { state } = useNextStepModal();

  const modalContent = resolveNextStepModalContent(state.actionKey || 'BOOK_MIMO_SURVEY', state.modalContent);
  const [rooms, setRooms] = useState<number>(1);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFee = useMemo(() => rooms * FEE_PER_ROOM_HKD, [rooms]);

  const fetchAvailability = useCallback(
    async (cursor?: string) => {
      if (!accessToken || !state.projectId || !isOpen) return;

      setLoadingSlots(true);
      setError(null);

      try {
        const params = new URLSearchParams({ rooms: String(rooms) });
        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(
          `${API_BASE_URL}/projects/${state.projectId}/mimo-survey/availability?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Unable to load survey availability right now.');
        }

        const data = (await response.json()) as AvailabilityResponse;
        setSlots(data.slots || []);
        setNextCursor(data.nextCursor || null);
        setDurationMinutes(Number(data.durationMinutes || 0));

        if ((data.slots || []).length > 0) {
          setSelectedSlotStart(data.slots[0].startsAt);
        } else {
          setSelectedSlotStart('');
        }
      } catch (err) {
        setSlots([]);
        setNextCursor(null);
        setSelectedSlotStart('');
        setDurationMinutes(0);
        setError(err instanceof Error ? err.message : 'Unable to load survey availability right now.');
      } finally {
        setLoadingSlots(false);
      }
    },
    [accessToken, isOpen, rooms, state.projectId],
  );

  useEffect(() => {
    if (!isOpen) {
      setSlots([]);
      setSelectedSlotStart('');
      setNextCursor(null);
      setDurationMinutes(0);
      setError(null);
      return;
    }

    void fetchAvailability();
  }, [fetchAvailability, isOpen]);

  const handleBookSurvey = async () => {
    if (!accessToken || !state.projectId) return;

    if (!Number.isInteger(rooms) || rooms <= 0) {
      setError('Please enter a valid room count.');
      return;
    }

    if (!selectedSlotStart) {
      setError('Please select an available survey slot.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/${state.projectId}/mimo-survey/book`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rooms,
          proposedDate: selectedSlotStart,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Unable to book survey right now.');
      }

      toast.success('Survey booking request sent to Mimo.');
      await state.onCompleted?.({
        projectId: state.projectId,
        actionKey: state.actionKey,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book survey right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChat = () => {
    if (!state.projectId) return;

    const projectName =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(`foh_project_name_${state.projectId}`) || ''
        : '';

    const initialMessage = [
      'MimoSurvey enquiry',
      projectName ? `Project: ${projectName}` : '',
      `Project ID: ${state.projectId}`,
      `Rooms to survey: ${rooms}`,
      `Proposed date: ${selectedSlotStart ? formatSlotDateTime(selectedSlotStart) : 'Not provided'}`,
    ].join('\n');

    window.dispatchEvent(
      new CustomEvent('foh-open-chat', {
        detail: {
          context: 'project_view',
          projectId: state.projectId,
          initialMessage,
          autoSendInitialMessage: true,
        },
      }),
    );

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="border-b border-slate-700 px-6 py-4">
          <h2 className="text-xl font-bold text-emerald-300">{modalContent.title || 'Book in your site survey'}</h2>
          <p className="mt-2 text-sm text-slate-200">
            {modalContent.body || 'Share room count and your preferred date to schedule Mimo Surveying+.'}
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-200">
              <span className="font-semibold">How many rooms do we need to survey?</span>
              <input
                type="number"
                min={1}
                step={1}
                value={rooms}
                onChange={(event) => {
                  const next = Number(event.target.value || 0);
                  setRooms(Number.isFinite(next) && next > 0 ? Math.floor(next) : 0);
                }}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                disabled={isLoading || submitting || loadingSlots}
              />
            </label>

            <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Estimated booking window</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatDuration(durationMinutes)}</p>
              <p className="mt-1 text-xs text-slate-400">Includes travel, setup, onsite survey and finalisation</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Next available slots (from tomorrow)</p>
              <button
                type="button"
                onClick={() => {
                  if (!nextCursor || loadingSlots || isLoading || submitting) return;
                  void fetchAvailability(nextCursor);
                }}
                disabled={!nextCursor || loadingSlots || isLoading || submitting}
                className="rounded-lg border border-slate-500 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loadingSlots ? 'Loading...' : 'Next 5'}
              </button>
            </div>

            {slots.length > 0 ? (
              <div className="grid gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlotStart === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setSelectedSlotStart(slot.startsAt)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                          : 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500'
                      }`}
                      disabled={isLoading || submitting || loadingSlots}
                    >
                      <p className="text-sm font-semibold">{formatSlotDateTime(slot.startsAt)}</p>
                      <p className="mt-0.5 text-xs text-slate-300">
                        {formatSlotTime(slot.startsAt)} - {formatSlotTime(slot.endsAt)} (HKT)
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {loadingSlots
                  ? 'Loading availability...'
                  : 'No available slots found yet. Try again with Next 5 or adjust room count.'}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Service fee</p>
            <p className="mt-1 text-lg font-semibold text-white">
              HKD {totalFee.toLocaleString('en-HK')} ({rooms} x {FEE_PER_ROOM_HKD})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={handleOpenChat}
            disabled={isLoading || submitting}
            className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/30 disabled:opacity-60"
          >
            Chat
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading || submitting}
            className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-60"
          >
            {modalContent.secondaryButtonLabel || 'Not now'}
          </button>
          <button
            type="button"
            onClick={handleBookSurvey}
            disabled={isLoading || submitting || loadingSlots || !selectedSlotStart}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : modalContent.primaryButtonLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
