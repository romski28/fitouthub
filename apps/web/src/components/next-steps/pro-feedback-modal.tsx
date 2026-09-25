'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { FeedbackChipGroup } from '@/components/feedback-chip-group';
import {
  PROJECT_GOOD_TAGS,
  PROJECT_BAD_TAGS,
  PLATFORM_GOOD_TAGS,
  PLATFORM_BAD_TAGS,
  EMOJI_SCALE,
} from '@/lib/feedback-tags';

interface Props {
  projectId: string;
  onClose: () => void;
}

/**
 * Pro feedback form — rate the client (A), project feedback (B), and optional
 * platform feedback (C, quarterly). Posts the rating to closeout-review and the
 * survey to /ux-feedback.
 */
export function ProFeedbackModal({ projectId, onClose }: Props) {
  const { accessToken } = useProfessionalAuth();
  const [rating, setRating] = useState(0);
  const [projectGoodTags, setProjectGoodTags] = useState<string[]>([]);
  const [projectBadTags, setProjectBadTags] = useState<string[]>([]);
  const [projectGoodText, setProjectGoodText] = useState('');
  const [projectBadText, setProjectBadText] = useState('');
  const [platformGoodTags, setPlatformGoodTags] = useState<string[]>([]);
  const [platformBadTags, setPlatformBadTags] = useState<string[]>([]);
  const [platformGoodText, setPlatformGoodText] = useState('');
  const [platformBadText, setPlatformBadText] = useState('');
  const [platformDue, setPlatformDue] = useState(true);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE_URL}/ux-feedback/platform-due`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : { due: true }))
      .then((d: { due?: boolean }) => setPlatformDue(d.due !== false))
      .catch(() => setPlatformDue(true));
  }, [accessToken]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const platformAnswered =
    platformGoodTags.length > 0 ||
    platformBadTags.length > 0 ||
    Boolean(platformGoodText.trim()) ||
    Boolean(platformBadText.trim());

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
        body: JSON.stringify({ rating }),
      });

      await fetch(`${API_BASE_URL}/ux-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          surveyVersion: 'feedback-v1',
          surveyType: 'feedback',
          answers: {
            projectGoodTags,
            projectBadTags,
            projectGoodText,
            projectBadText,
            platformGoodTags,
            platformBadTags,
            platformGoodText,
            platformBadText,
            platformRated: platformAnswered,
          },
        }),
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
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <p className="text-lg font-semibold text-slate-900">Project feedback</p>
          <p className="mt-1 text-sm text-slate-600">A few quick taps to help everyone improve.</p>
        </div>

        {/* Section A — rate the client */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">How would you rate this client?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`h-11 w-11 rounded-lg border text-lg transition ${
                  rating === n
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-300 bg-white hover:border-emerald-400'
                }`}
              >
                {EMOJI_SCALE[n - 1]}
              </button>
            ))}
          </div>
        </div>

        {/* Section B — the project */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">The project</p>
          <FeedbackChipGroup
            label="What went well?"
            tags={PROJECT_GOOD_TAGS}
            selected={projectGoodTags}
            text={projectGoodText}
            onToggleTag={(id) => toggle(projectGoodTags, setProjectGoodTags, id)}
            onTextChange={setProjectGoodText}
          />
          <FeedbackChipGroup
            label="What could have gone better?"
            tags={PROJECT_BAD_TAGS}
            selected={projectBadTags}
            text={projectBadText}
            onToggleTag={(id) => toggle(projectBadTags, setProjectBadTags, id)}
            onTextChange={setProjectBadText}
          />
        </div>

        {/* Section C — platform (optional, quarterly) */}
        {platformDue && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <button
              type="button"
              onClick={() => setPlatformOpen((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
            >
              <span>
                About Mimo{' '}
                <span className="text-xs font-normal text-slate-400">(optional)</span>
              </span>
              <span>{platformOpen ? '▾' : '▸'}</span>
            </button>
            {platformOpen && (
              <div className="space-y-4">
                <FeedbackChipGroup
                  label="What do you like about Mimo?"
                  tags={PLATFORM_GOOD_TAGS}
                  selected={platformGoodTags}
                  text={platformGoodText}
                  onToggleTag={(id) => toggle(platformGoodTags, setPlatformGoodTags, id)}
                  onTextChange={setPlatformGoodText}
                />
                <FeedbackChipGroup
                  label="What would make Mimo better?"
                  tags={PLATFORM_BAD_TAGS}
                  selected={platformBadTags}
                  text={platformBadText}
                  onToggleTag={(id) => toggle(platformBadTags, setPlatformBadTags, id)}
                  onTextChange={setPlatformBadText}
                />
              </div>
            )}
          </div>
        )}

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

