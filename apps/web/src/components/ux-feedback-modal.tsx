'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/config/api';

type Question = {
  key: string;
  label: string;
  type: 'rating' | 'text';
};

const QUESTIONS: Question[] = [
  { key: 'mimo_understanding', label: 'How well did MIMO understand your project needs?', type: 'rating' },
  { key: 'pro_selection', label: 'Was selecting professionals easy and clear?', type: 'rating' },
  { key: 'confusing', label: 'Did anything feel confusing or difficult?', type: 'text' },
  { key: 'improvement', label: 'What one thing would make this experience better?', type: 'text' },
];

interface Props {
  projectId: string;
  accessToken?: string | null;
  onClose: () => void;
}

export function UxFeedbackModal({ projectId, accessToken, onClose }: Props) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const answers: Record<string, unknown> = {};
      for (const q of QUESTIONS) {
        if (q.type === 'rating') answers[q.key] = ratings[q.key] ?? null;
        else answers[q.key] = texts[q.key]?.trim() || null;
      }

      await fetch(`${API_BASE_URL}/ux-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ projectId, answers }),
      });
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch {
      // Silently fail — don't block the user
      onClose();
    }
  };

  const handleSkip = () => onClose();

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
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <p className="text-lg font-semibold text-slate-900">Quick feedback</p>
          <p className="mt-1 text-sm text-slate-600">
            Help us improve MIMO. This takes 30 seconds and helps us make the experience better for everyone.
          </p>
        </div>

        <div className="space-y-5">
          {QUESTIONS.map((q) => (
            <div key={q.key} className="space-y-2">
              <p className="text-sm font-medium text-slate-800">{q.label}</p>
              {q.type === 'rating' ? (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRatings((prev) => ({ ...prev, [q.key]: n }))}
                      className={`h-9 w-9 rounded-lg border text-sm font-semibold transition ${
                        ratings[q.key] === n
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={texts[q.key] || ''}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  rows={2}
                  placeholder="Optional — share your thoughts..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm resize-none"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { QUESTIONS };
