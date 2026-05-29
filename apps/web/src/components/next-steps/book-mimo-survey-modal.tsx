'use client';

import { useMemo, useState } from 'react';
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

const toDateTimeLocalValue = (value: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const toIsoFromDateTimeLocal = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
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
  const [proposedDate, setProposedDate] = useState<string>(() => {
    const initial = new Date();
    initial.setDate(initial.getDate() + 2);
    initial.setHours(10, 0, 0, 0);
    return toDateTimeLocalValue(initial);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFee = useMemo(() => rooms * FEE_PER_ROOM_HKD, [rooms]);

  const handleBookSurvey = async () => {
    if (!accessToken || !state.projectId) return;

    if (!Number.isInteger(rooms) || rooms <= 0) {
      setError('Please enter a valid room count.');
      return;
    }

    const isoProposedDate = toIsoFromDateTimeLocal(proposedDate);
    if (!isoProposedDate) {
      setError('Please select a valid proposed survey date and time.');
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
          proposedDate: isoProposedDate,
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
      `Proposed date: ${proposedDate ? new Date(proposedDate).toLocaleString('en-HK') : 'Not provided'}`,
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
                disabled={isLoading || submitting}
              />
            </label>

            <label className="space-y-2 text-sm text-slate-200">
              <span className="font-semibold">Proposed site survey date</span>
              <input
                type="datetime-local"
                value={proposedDate}
                min={toDateTimeLocalValue(new Date())}
                onChange={(event) => setProposedDate(event.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                disabled={isLoading || submitting}
              />
            </label>
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
            disabled={isLoading || submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : modalContent.primaryButtonLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
