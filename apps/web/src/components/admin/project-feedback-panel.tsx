'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

interface Review {
  id: string;
  reviewerType: string;
  reviewerId?: string | null;
  reviewedProfessionalId?: string | null;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

interface SurveyEntry {
  id: string;
  respondentType?: string | null;
  answers: Record<string, any>;
  submittedAt: string;
}

const TAG_KEYS: Array<[keyof Record<string, any>, string]> = [
  ['projectGoodTags', 'Project 👍'],
  ['projectBadTags', 'Project 👎'],
  ['platformGoodTags', 'Platform 👍'],
  ['platformBadTags', 'Platform 👎'],
];

const TEXT_KEYS: Array<[keyof Record<string, any>, string]> = [
  ['projectGoodText', 'Project good'],
  ['projectBadText', 'Project bad'],
  ['platformGoodText', 'Platform good'],
  ['platformBadText', 'Platform bad'],
];

export function ProjectFeedbackPanel({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [surveys, setSurveys] = useState<SurveyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !accessToken) return;
    Promise.all([
      fetch(`${API_BASE_URL}/financial/project/${projectId}/closeout`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : { reviews: [] })),
      fetch(`${API_BASE_URL}/ux-feedback/project/${projectId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([closeoutData, surveyData]) => {
        setReviews(Array.isArray(closeoutData?.reviews) ? closeoutData.reviews : []);
        setSurveys(Array.isArray(surveyData) ? surveyData : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, accessToken]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 text-sm text-slate-500">
        Loading feedback…
      </div>
    );
  }

  if (reviews.length === 0 && surveys.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 text-sm text-slate-500">
        No feedback submitted for this project yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-5">
      <h2 className="text-lg font-bold text-slate-900">Feedback</h2>

      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {r.reviewerType === 'client'
                    ? r.reviewedProfessionalId
                      ? 'Client → contractor'
                      : 'Client review'
                    : 'Professional → client'}
                </span>
                <span className="text-sm text-amber-500">{'★'.repeat(r.rating)}</span>
              </div>
              {r.comment && <p className="mt-1 text-sm text-slate-700">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {surveys.map((s) => {
        const a = s.answers || {};
        const hasTags = TAG_KEYS.some(([k]) => Array.isArray(a[k]) && (a[k] as string[]).length > 0);
        const hasText = TEXT_KEYS.some(([k]) => Boolean(a[k]));
        if (!hasTags && !hasText) return null;
        return (
          <div key={s.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {s.respondentType === 'professional' ? 'Professional survey' : 'Client survey'}
              </span>
              <span className="text-xs text-slate-400">{new Date(s.submittedAt).toLocaleDateString('en-GB')}</span>
            </div>
            {TAG_KEYS.map(([key, label]) =>
              Array.isArray(a[key]) && (a[key] as string[]).length > 0 ? (
                <p key={key as string} className="text-sm text-slate-700">
                  <span className="text-slate-400">{label}:</span> {(a[key] as string[]).join(', ')}
                </p>
              ) : null,
            )}
            {TEXT_KEYS.map(([key, label]) =>
              a[key] ? (
                <p key={key as string} className="text-sm text-slate-700">
                  <span className="text-slate-400">{label}:</span> {a[key]}
                </p>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}
