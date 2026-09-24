'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useProfessionalAuth } from '@/context/professional-auth-context';

interface Props {
  projectId: string;
  onClose: () => void;
}

/**
 * Generic pro feedback form — rate the client (1–5 stars) + optional comment.
 * Posts to the closeout-review endpoint (professional review). Can be extended later.
 */
export function ProFeedbackModal({ projectId, onClose }: Props) {
  const { accessToken } = useProfessionalAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/financial/project/${projectId}/closeout-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl text-center">
          <p className="text-2xl">🙏</p>
          <p className="mt-3 text-lg font-semibold text-slate-900">Thank you for your feedback!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5">
        <div>
          <p className="text-lg font-semibold text-slate-900">Rate your experience</p>
          <p className="mt-1 text-sm text-slate-600">
            How would you rate working with this client?
          </p>
        </div>

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`h-11 w-11 rounded-lg border text-base font-semibold transition ${
                rating === n
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Optional — share your thoughts..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm resize-none"
        />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || rating < 1}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
