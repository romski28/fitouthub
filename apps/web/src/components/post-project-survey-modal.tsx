'use client';

import { useState, useCallback } from 'react';
import { API_BASE_URL } from '@/config/api';
import { ModalOverlay } from './modal-overlay';

// ── Types ──

type ClarityOption = 'landing' | 'describing' | 'choosing' | 'reviewing';
type ClarityValue = 'clear' | 'confused' | null;
type MethodOption =
  | 'friend'
  | 'whatsapp_group'
  | 'google_social'
  | 'building_mgmt'
  | 'carousell_listings'
  | 'never_done'
  | 'landlord_agent'
  | 'other';
type ComparisonFeeling = 'much_better' | 'somewhat_better' | 'about_same' | 'somewhat_worse' | 'much_worse';
type UserRoleType = 'owner_occupy' | 'renter' | 'owner_landlord' | 'property_pro' | 'none';
type RenovationHistory = 'yes_painful' | 'yes_well' | 'no_planning' | 'no_no_plans';

interface SurveyAnswers {
  // First Impressions
  feeling: string;
  clarity: Record<ClarityOption, ClarityValue>;
  uncertain_moment: string;
  missing_info: string;

  // Competition
  current_methods: MethodOption[];
  other_method: string;
  mimo_comparison: ComparisonFeeling | null;
  mimo_better: string;
  alternatives_better: string;

  // Would you use it
  return_likelihood: number | null;
  return_reason: string;
  recommend_likelihood: number | null;

  // Ideas & concerns
  change_one_thing: string;
  feature_wish: string;
  biggest_worry: string;

  // About you
  user_role: UserRoleType | null;
  renovation_history: RenovationHistory | null;

  // Looking forward
  escrow_comfortable: boolean | null;
  escrow_reason: string;
  escrow_concern: string;
}

const EMPTY_ANSWERS: SurveyAnswers = {
  feeling: '',
  clarity: { landing: null, describing: null, choosing: null, reviewing: null },
  uncertain_moment: '',
  missing_info: '',
  current_methods: [],
  other_method: '',
  mimo_comparison: null,
  mimo_better: '',
  alternatives_better: '',
  return_likelihood: null,
  return_reason: '',
  recommend_likelihood: null,
  change_one_thing: '',
  feature_wish: '',
  biggest_worry: '',
  user_role: null,
  renovation_history: null,
  escrow_comfortable: null,
  escrow_reason: '',
  escrow_concern: '',
};

const SECTIONS = [
  { key: 'first_impressions', title: 'First Impressions' },
  { key: 'competition', title: 'The Competition in Your Head' },
  { key: 'would_you_use', title: 'Would You Use It?' },
  { key: 'ideas', title: 'Ideas, Concerns & Anything We Missed' },
  { key: 'about_you', title: 'A Little About You', optional: true },
  { key: 'looking_forward', title: 'Looking Forward' },
] as const;

// ── Components ──

function MatrixRadio({
  options,
  value,
  onChange,
}: {
  options: { key: ClarityOption; label: string }[];
  value: Record<ClarityOption, ClarityValue>;
  onChange: (key: ClarityOption, val: ClarityValue) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-3 text-left font-medium text-slate-700"></th>
            <th className="px-3 py-2 text-center font-medium text-emerald-700">Clear ✓</th>
            <th className="px-3 py-2 text-center font-medium text-amber-700">Confused ?</th>
          </tr>
        </thead>
        <tbody>
          {options.map((opt) => (
            <tr key={opt.key} className="border-b border-slate-100">
              <td className="py-2.5 pr-3 text-slate-800">{opt.label}</td>
              <td className="px-3 py-2.5 text-center">
                <input
                  type="radio"
                  name={`clarity-${opt.key}`}
                  checked={value[opt.key] === 'clear'}
                  onChange={() => onChange(opt.key, 'clear')}
                  className="h-4 w-4 accent-emerald-600"
                />
              </td>
              <td className="px-3 py-2.5 text-center">
                <input
                  type="radio"
                  name={`clarity-${opt.key}`}
                  checked={value[opt.key] === 'confused'}
                  onChange={() => onChange(opt.key, 'confused')}
                  className="h-4 w-4 accent-amber-500"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NpsScale({
  value,
  onChange,
  min = 0,
  max = 10,
}: {
  value: number | null;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  return (
    <div className="flex flex-wrap gap-1.5">
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-9 w-9 rounded-lg border text-sm font-semibold transition ${
            value === n
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
          }`}
        >
          {n}
        </button>
      ))}
      <span className="self-center ml-2 text-xs text-slate-400">
        {min === 1 ? '1=Never' : '0=Never'} · {max}=Definitely
      </span>
    </div>
  );
}

// ── Props ──

interface Props {
  projectId: string;
  accessToken?: string | null;
  onClose: () => void;
}

export function PostProjectSurveyModal({ projectId, accessToken, onClose }: Props) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>(EMPTY_ANSWERS);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const section = SECTIONS[sectionIndex];
  const isLast = sectionIndex === SECTIONS.length - 1;
  const progress = Math.round(((sectionIndex + 1) / SECTIONS.length) * 100);

  const update = useCallback(<K extends keyof SurveyAnswers>(key: K, value: SurveyAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/ux-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          answers,
          surveyVersion: '2.0',
        }),
      });
      setSubmitted(true);
    } catch {
      onClose();
    }
  };

  // ── Thank-you ──
  if (submitted) {
    return (
      <ModalOverlay isOpen onClose={onClose} maxWidth="max-w-lg">
        <div className="space-y-5 text-center py-4">
          <p className="text-5xl">🙏</p>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Thank you.</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              You just helped us build something Hong Kong genuinely needs.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              If anything else comes to mind… at 2am, in the shower, on the MTR — the chat icon stays open. Use it.
            </p>
            <p className="mt-4 text-xs font-medium text-slate-400">Kelvin, Priyesh &amp; Roman</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Close
          </button>
        </div>
      </ModalOverlay>
    );
  }

  // ── Render Section ──
  const renderSection = () => {
    switch (section.key) {
      case 'first_impressions':
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">In one word, how did the experience just now make you feel?</p>
              <input
                type="text"
                maxLength={20}
                value={answers.feeling}
                onChange={(e) => update('feeling', e.target.value)}
                placeholder="e.g. confident, confused, hopeful…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Which steps felt clear and which confused you?</p>
              <MatrixRadio
                options={[
                  { key: 'landing', label: 'Landing / homepage' },
                  { key: 'describing', label: 'Describing my project / scope' },
                  { key: 'choosing', label: 'Choosing contractors' },
                  { key: 'reviewing', label: 'Reviewing my quote request' },
                ]}
                value={answers.clarity}
                onChange={(key, val) => update('clarity', { ...answers.clarity, [key]: val })}
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">Was there any moment where you weren&apos;t sure what to do next, or what was about to happen?</p>
              <textarea
                rows={3}
                value={answers.uncertain_moment}
                onChange={(e) => update('uncertain_moment', e.target.value)}
                placeholder="Tell us what happened…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">What&apos;s one piece of information you wanted but could not find?</p>
              <textarea
                rows={3}
                value={answers.missing_info}
                onChange={(e) => update('missing_info', e.target.value)}
                placeholder="Anything you were looking for…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        );

      case 'competition':
        return (
          <div className="space-y-5">
            <p className="text-sm text-slate-500 italic">We want to know what you were silently comparing this to.</p>

            <div>
              <p className="text-sm font-semibold text-slate-900">When you need to find a contractor, what do you do at the moment?</p>
              <p className="text-xs text-slate-500 mt-0.5">Select all that apply.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {([
                  { key: 'friend' as MethodOption, label: 'Asked a friend / family member for a recommendation' },
                  { key: 'whatsapp_group' as MethodOption, label: 'Used WhatsApp / a building chat group' },
                  { key: 'google_social' as MethodOption, label: 'Searched on Google or social media' },
                  { key: 'building_mgmt' as MethodOption, label: 'Called my building management' },
                  { key: 'carousell_listings' as MethodOption, label: 'Used Carousell / Open Rice-style listings' },
                  { key: 'never_done' as MethodOption, label: "I've never had to do this" },
                  { key: 'landlord_agent' as MethodOption, label: 'Call the landlord or estate agent' },
                  { key: 'other' as MethodOption, label: 'Other (please specify)' },
                ] as const).map((opt) => (
                  <label key={opt.key} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={answers.current_methods.includes(opt.key)}
                      onChange={() => {
                        const next = answers.current_methods.includes(opt.key)
                          ? answers.current_methods.filter((m) => m !== opt.key)
                          : [...answers.current_methods, opt.key];
                        update('current_methods', next);
                      }}
                      className="mt-0.5 h-4 w-4 rounded accent-emerald-600"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
              {answers.current_methods.includes('other') && (
                <input
                  type="text"
                  maxLength={100}
                  value={answers.other_method}
                  onChange={(e) => update('other_method', e.target.value)}
                  placeholder="Please specify…"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">Compared to your normal method, MIMO feels…</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { key: 'much_better' as ComparisonFeeling, label: 'Much better' },
                  { key: 'somewhat_better' as ComparisonFeeling, label: 'Somewhat better' },
                  { key: 'about_same' as ComparisonFeeling, label: 'About the same' },
                  { key: 'somewhat_worse' as ComparisonFeeling, label: 'Somewhat worse' },
                  { key: 'much_worse' as ComparisonFeeling, label: 'Much worse' },
                ]).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => update('mimo_comparison', opt.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      answers.mimo_comparison === opt.key
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">What <em>one</em> thing does MIMO do better than the alternatives you&apos;ve used?</p>
              <input
                type="text"
                maxLength={200}
                value={answers.mimo_better}
                onChange={(e) => update('mimo_better', e.target.value)}
                placeholder="Be specific…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">What <em>one</em> thing do the alternatives do better than MIMO? (be honest, this helps us most)</p>
              <input
                type="text"
                maxLength={200}
                value={answers.alternatives_better}
                onChange={(e) => update('alternatives_better', e.target.value)}
                placeholder="Honest feedback…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        );

      case 'would_you_use':
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">If you had a real home maintenance or renovation project tomorrow, how likely is it you&apos;d come back and use MIMO?</p>
              <div className="mt-2">
                <NpsScale min={1} max={10} value={answers.return_likelihood} onChange={(n) => update('return_likelihood', n)} />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">What&apos;s the main reason for that score?</p>
              <input
                type="text"
                maxLength={200}
                value={answers.return_reason}
                onChange={(e) => update('return_reason', e.target.value)}
                placeholder="Tell us why…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">How likely are you to recommend MIMO to a friend, neighbour, or building chat group?</p>
              <div className="mt-2">
                <NpsScale value={answers.recommend_likelihood} onChange={(n) => update('recommend_likelihood', n)} />
              </div>
            </div>
          </div>
        );

      case 'ideas':
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">If you could change <em>one thing</em> about the experience right now, what would it be?</p>
              <textarea
                rows={3}
                value={answers.change_one_thing}
                onChange={(e) => update('change_one_thing', e.target.value)}
                placeholder="Your honest thought…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">What&apos;s a feature you wished MIMO had, even if it sounds wild?</p>
              <textarea
                rows={3}
                value={answers.feature_wish}
                onChange={(e) => update('feature_wish', e.target.value)}
                placeholder="Dream big…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">What worries you most about a platform like MIMO succeeding in Hong Kong? (hard truth)</p>
              <textarea
                rows={3}
                value={answers.biggest_worry}
                onChange={(e) => update('biggest_worry', e.target.value)}
                placeholder="We can take it…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        );

      case 'about_you':
        return (
          <div className="space-y-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Optional — skip if you prefer</p>

            <div>
              <p className="text-sm font-semibold text-slate-900">Which best describes you right now?</p>
              <select
                value={answers.user_role || ''}
                onChange={(e) => update('user_role', (e.target.value || null) as UserRoleType | null)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                <option value="owner_occupy">I own the flat I live in</option>
                <option value="renter">I rent the flat I live in</option>
                <option value="owner_landlord">I own and rent out one or more flats</option>
                <option value="property_pro">I work in property / construction / design professionally</option>
                <option value="none">None of the above</option>
              </select>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">Have you done a renovation or major home repair in the last 24 months?</p>
              <select
                value={answers.renovation_history || ''}
                onChange={(e) => update('renovation_history', (e.target.value || null) as RenovationHistory | null)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                <option value="yes_painful">Yes, and it was painful</option>
                <option value="yes_well">Yes, and it went well</option>
                <option value="no_planning">No, but I&apos;m planning one</option>
                <option value="no_no_plans">No, and no plans</option>
              </select>
            </div>
          </div>
        );

      case 'looking_forward':
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">Would you be comfortable paying MIMO before work starts, knowing the funds won&apos;t be touched until all parties agree the project or stage is complete?</p>
              <div className="mt-2 flex gap-2">
                {[
                  { key: true, label: 'Yes' },
                  { key: false, label: 'No' },
                ].map((opt) => (
                  <button
                    key={String(opt.key)}
                    type="button"
                    onClick={() => update('escrow_comfortable', opt.key)}
                    className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
                      answers.escrow_comfortable === opt.key
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">Can you tell us why you feel that way?</p>
              <textarea
                rows={3}
                value={answers.escrow_reason}
                onChange={(e) => update('escrow_reason', e.target.value)}
                placeholder="Your thoughts…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm italic text-slate-500 mb-1">
                To protect both parties, customers pay upfront (basic services) or by milestone (renovations). MIMO holds the funds and only releases them once both sides sign off on each stage.
              </p>
              <p className="text-sm font-semibold text-slate-900">Would you have concern with that? Please elaborate.</p>
              <textarea
                rows={3}
                value={answers.escrow_concern}
                onChange={(e) => update('escrow_concern', e.target.value)}
                placeholder="Your concerns…"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-medium text-slate-500 shrink-0">
            {sectionIndex + 1} of {SECTIONS.length}
          </span>
        </div>

        {/* Section header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{section.title}</p>
          {section.optional && <p className="text-xs text-slate-400 mt-0.5">All questions in this section are optional.</p>}
        </div>

        {/* Questions */}
        <div className="max-h-[55vh] overflow-y-auto pr-2">{renderSection()}</div>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {sectionIndex > 0 && (
            <button
              type="button"
              onClick={() => setSectionIndex((prev) => prev - 1)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit feedback'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSectionIndex((prev) => prev + 1)}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {section.optional ? 'Next (or skip)' : 'Next'}
            </button>
          )}
        </div>

        {/* Skip entire survey */}
        {sectionIndex === 0 && (
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            Skip survey
          </button>
        )}
      </div>
    </ModalOverlay>
  );
}
