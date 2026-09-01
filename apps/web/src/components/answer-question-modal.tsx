'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';

interface AnswerQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  qnaId: string;
  accessToken: string;
}

export default function AnswerQuestionModal({
  isOpen,
  onClose,
  projectId,
  qnaId,
  accessToken,
}: AnswerQuestionModalProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/scope-qna/${qnaId}/answer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to submit answer');
      }
      toast.success('Answer sent to your PM');
      setAnswer('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">Answer your PM&apos;s question</h2>
        <p className="mt-1 text-sm text-slate-600">Your answer will help refine the project scope.</p>

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          placeholder="Type your answer…"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          disabled={submitting}
        />

        <div className="mt-4 flex justify-end gap-2">
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
            onClick={handleSubmit}
            disabled={submitting || !answer.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
