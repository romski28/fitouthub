'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
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
  accessToken?: string | null;
  onClose: () => void;
}

type ProjectProfessional = {
  id: string;
  status: string;
  professionalId: string;
  professional?: { id: string; fullName?: string; businessName?: string };
};

const NON_PARTICIPATING = ['declined', 'rejected', 'withdrawn'];

export function UxFeedbackModal({ projectId, accessToken, onClose }: Props) {
  const [pros, setPros] = useState<ProjectProfessional[]>([]);
  const [proRatings, setProRatings] = useState<Record<string, number>>({});
  const [mimoUnderstanding, setMimoUnderstanding] = useState(0);
  const [proSelection, setProSelection] = useState(0);
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
    if (!projectId) return;
    fetch(`${API_BASE_URL}/projects/${projectId}/professionals`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProjectProfessional[]) => {
        setPros(
          (Array.isArray(data) ? data : []).filter(
            (p) => p.professional && !NON_PARTICIPATING.includes(String(p.status || '').toLowerCase()),
          ),
        );
      })
      .catch(() => setPros([]));
  }, [projectId, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE_URL}/ux-feedback/platform-due`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : { due: true }))
      .then((d: { due?: boolean }) => setPlatformDue(d.due !== false))
      .catch(() => setPlatformDue(true));
  }, [accessToken]);

  const proName = (p: ProjectProfessional) =>
    p.professional?.businessName || p.professional?.fullName || 'your contractor';

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const platformAnswered =
    platformGoodTags.length > 0 ||
    platformBadTags.length > 0 ||
    Boolean(platformGoodText.trim()) ||
    Boolean(platformBadText.trim());

  const renderStars = (value: number, onChange: (n: number) => void, size = 'h-9 w-9') => (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`${size} rounded-lg border text-sm font-semibold transition ${
            value === n
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );

  const renderEmoji = (value: number, onChange: (n: number) => void) => (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-10 w-10 rounded-lg border text-lg transition ${
            value === n
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-300 bg-white hover:border-emerald-400'
          }`}
        >
          {EMOJI_SCALE[n - 1]}
        </button>
      ))}
    </div>
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const proRatingEntries = Object.entries(proRatings).filter(([, v]) => v > 0);
      if (proRatingEntries.length > 0) {
        await fetch(`${API_BASE_URL}/financial/project/${projectId}/rate-professionals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            ratings: proRatingEntries.map(([professionalId, rating]) => ({ professionalId, rating })),
          }),
        }).catch(() => undefined);
      }

      await fetch(`${API_BASE_URL}/ux-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          surveyVersion: 'feedback-v1',
          answers: {
            mimo_understanding: mimoUnderstanding || null,
            pro_selection: proSelection || null,
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

        {/* Section A — rate contractor(s) */}
        {pros.length > 0 && (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              Rate your contractor{pros.length > 1 ? 's' : ''}
            </p>
            {pros.map((p) => (
              <div key={p.id} className="space-y-2">
                <p className="text-sm font-medium text-slate-800">How would you rate {proName(p)}?</p>
                {renderEmoji(proRatings[p.professional!.id] || 0, (n) =>
                  setProRatings((prev) => ({ ...prev, [p.professional!.id]: n })),
                )}
              </div>
            ))}
          </div>
        )}

        {/* Platform ratings */}
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">How well did MIMO understand your project needs?</p>
            {renderStars(mimoUnderstanding, setMimoUnderstanding)}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">Was selecting professionals easy and clear?</p>
            {renderStars(proSelection, setProSelection)}
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

