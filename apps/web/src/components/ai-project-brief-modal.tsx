'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import LocationSelect, { CanonicalLocation } from '@/components/location-select';
import { HkDistrictList } from '@/components/hk-district-list';
import { HkDistrictMap } from '@/components/hk-district-map';
import { MapOrList } from '@/components/map-or-list';
import { areaCodeToCanonicalLocation, deriveProjectAreaCodeFromLocation } from '@/lib/hk-districts';

type WizardStep =
  | { kind: 'title' }
  | { kind: 'location' }
  | { kind: 'emergency' }
  | { kind: 'scope' }
  | { kind: 'followup'; question: string; id: string };

interface AiBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTitle?: string;
  initialSummary?: string;
  initialScope?: string;
  initialAssumptions?: string[];
  initialLocation?: CanonicalLocation;
  fallbackLocation?: CanonicalLocation;
  initialEmergency?: boolean;
  followUpQuestions?: string[];
  onComplete: (payload: {
    title: string;
    summary: string;
    location: CanonicalLocation;
    isEmergency: boolean;
    followUpAnswers: Array<{ question: string; answer: string }>;
  }) => void;
}

const MOTIVATION = [
  'Nice! Let’s build this in under a minute ✨',
  'You’re on fire — one quick step at a time 🔥',
  'Looking great. This is coming together 👌',
  'Final stretch — let’s launch this 🚀',
];

export function AiProjectBriefModal({
  isOpen,
  onClose,
  initialTitle,
  initialSummary,
  initialScope,
  initialAssumptions,
  initialLocation,
  fallbackLocation,
  initialEmergency,
  followUpQuestions,
  onComplete,
}: AiBriefModalProps) {
  const mergedInitialLocation = useMemo<CanonicalLocation>(() => {
    if (initialLocation?.primary || initialLocation?.secondary || initialLocation?.tertiary) {
      return initialLocation;
    }
    return fallbackLocation || {};
  }, [initialLocation, fallbackLocation]);

  const [title, setTitle] = useState(initialTitle || '');
  const [summary, setSummary] = useState('');
  const [location, setLocation] = useState<CanonicalLocation>(mergedInitialLocation);
  const [isEmergency, setIsEmergency] = useState<boolean | null>(
    typeof initialEmergency === 'boolean' ? initialEmergency : null,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const stepPanelRef = useRef<HTMLDivElement | null>(null);

  const steps = useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [];

    list.push({ kind: 'title' });

    const hasAiLocation = Boolean(
      initialLocation?.primary || initialLocation?.secondary || initialLocation?.tertiary,
    );
    const hasFallbackLocation = Boolean(
      fallbackLocation?.primary || fallbackLocation?.secondary || fallbackLocation?.tertiary,
    );
    if (!hasAiLocation && !hasFallbackLocation) list.push({ kind: 'location' });

    list.push({ kind: 'emergency' });

    const followUps = (followUpQuestions || []).filter((question) => question.trim().length > 0).slice(0, 3);
    followUps.forEach((question, index) => {
      list.push({ kind: 'followup', question, id: `q-${index}` });
    });

    if (!(initialScope || '').trim() && !(initialSummary || '').trim()) list.push({ kind: 'scope' });

    return list;
  }, [
    initialLocation?.primary,
    initialLocation?.secondary,
    initialLocation?.tertiary,
    fallbackLocation?.primary,
    fallbackLocation?.secondary,
    fallbackLocation?.tertiary,
    followUpQuestions,
    initialSummary,
    initialScope,
  ]);

  const totalSteps = steps.length;
  const currentStep = steps[Math.min(stepIndex, Math.max(0, totalSteps - 1))];

  const currentMotivation = MOTIVATION[Math.min(stepIndex, MOTIVATION.length - 1)] || MOTIVATION[MOTIVATION.length - 1];

  const hasLocation = Boolean(location.primary || location.secondary || location.tertiary);
  const selectedProjectAreaCode = useMemo(
    () => deriveProjectAreaCodeFromLocation(location),
    [location.primary, location.secondary, location.tertiary],
  );

  const handleProjectMapSelection = (codes: string[]) => {
    const nextCode = codes[0];
    setLocation((nextCode ? areaCodeToCanonicalLocation(nextCode) : {}) as CanonicalLocation);
  };

  const canContinue = useMemo(() => {
    if (!currentStep) return true;
    if (currentStep.kind === 'title') return title.trim().length > 0;
    if (currentStep.kind === 'location') return hasLocation;
    if (currentStep.kind === 'emergency') return isEmergency !== null;
    if (currentStep.kind === 'scope') return summary.trim().length > 0;
    if (currentStep.kind === 'followup') return (answers[currentStep.id] || '').trim().length > 0;
    return true;
  }, [currentStep, title, hasLocation, isEmergency, summary, answers]);

  const progress = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 100;

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => {
      const panel = stepPanelRef.current;
      if (!panel) return;

      const preferredSelector =
        currentStep?.kind === 'emergency'
          ? 'button'
          : 'input, textarea, select, button';

      const target = panel.querySelector<HTMLElement>(preferredSelector);
      target?.focus();
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, stepIndex, currentStep?.kind]);

  const handleNext = () => {
    if (!canContinue) return;
    if (stepIndex < totalSteps - 1) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    if (!hasLocation) return;
    if (isEmergency === null) return;

    const followUpAnswers = (steps.filter((step): step is Extract<WizardStep, { kind: 'followup' }> => step.kind === 'followup'))
      .map((step) => ({ question: step.question, answer: (answers[step.id] || '').trim() }))
      .filter((item) => item.answer.length > 0);

    const baseSummary = (summary || initialScope || initialSummary || '').trim();

    onComplete({
      title: title.trim(),
      summary: baseSummary,
      location,
      isEmergency,
      followUpAnswers,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">Project Quest</p>
            <h2 className="text-xl font-bold text-slate-900">Let&apos;s craft your project vibe</h2>
            <p className="mt-1 text-sm text-slate-600">{currentMotivation}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Step {Math.min(stepIndex + 1, Math.max(totalSteps, 1))} of {Math.max(totalSteps, 1)}</p>
            <p className="text-sm font-semibold text-emerald-700">{progress}% complete</p>
          </div>
        </div>

        <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div ref={stepPanelRef} className="min-h-[260px] rounded-xl border border-slate-200 bg-slate-50 p-4">
          {currentStep?.kind === 'title' && (
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Mini brief</p>
                <div className="mt-1 space-y-2">
                  {(initialSummary || '').trim() && (
                    <p><span className="font-semibold text-slate-900">Summary:</span> {(initialSummary || '').trim()}</p>
                  )}
                  {(initialScope || '').trim() && (
                    <p><span className="font-semibold text-slate-900">Scope:</span> {(initialScope || '').trim()}</p>
                  )}
                  {Array.isArray(initialAssumptions) && initialAssumptions.length > 0 && (
                    <div>
                      <p className="font-semibold text-slate-900">Assumptions:</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {initialAssumptions.slice(0, 3).map((assumption, index) => (
                          <li key={`assumption-${index}`}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(initialSummary || '').trim() && !(initialScope || '').trim() && (!initialAssumptions || initialAssumptions.length === 0) && (
                    <p>We extracted your project details from the prompt.</p>
                  )}
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-900">📝 Shall we call this project…</p>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Bathroom leak repair"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          {currentStep?.kind === 'location' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">📍 Where is this project located?</p>
              <p className="text-xs text-slate-600">We prefilled your saved area when we could — tweak it if needed.</p>
              <MapOrList
                storageKey="fh-map-or-list-preference"
                label="Project location input mode"
                helperText="Use the district map for a visual pick, or switch to the text list/dropdowns."
                mapLabel="Map"
                listLabel="Words"
                panelClassName="max-h-[45vh] overflow-y-auto pr-1"
                map={
                  <HkDistrictMap
                    selectionMode="single"
                    selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                    onChange={handleProjectMapSelection}
                  />
                }
                list={
                  <div className="space-y-3">
                    <HkDistrictList
                      selectionMode="single"
                      selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                      onChange={handleProjectMapSelection}
                    />
                    <LocationSelect
                      value={location}
                      onChange={setLocation}
                      enableSearch={true}
                    />
                  </div>
                }
              />
            </div>
          )}

          {currentStep?.kind === 'emergency' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">🚨 Is this an emergency project?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIsEmergency(true)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm ${isEmergency === true ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <p className="font-semibold">Yes, urgent</p>
                  <p className="mt-1 text-xs">We’ll prioritize emergency-ready professionals.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEmergency(false)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm ${isEmergency === false ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <p className="font-semibold">No, standard</p>
                  <p className="mt-1 text-xs">Normal matching works perfectly.</p>
                </button>
              </div>
            </div>
          )}

          {currentStep?.kind === 'followup' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">💡 Quick pit stop</p>
              <p className="text-sm text-slate-700">{currentStep.question}</p>
              <textarea
                rows={4}
                value={answers[currentStep.id] || ''}
                onChange={(event) => setAnswers((prev) => ({ ...prev, [currentStep.id]: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Your answer"
              />
            </div>
          )}

          {currentStep?.kind === 'scope' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">🧾 Any final notes for professionals?</p>
              <textarea
                rows={5}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Scope, constraints, timing, access notes..."
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={stepIndex === 0 ? onClose : () => setStepIndex((prev) => Math.max(0, prev - 1))}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {stepIndex === 0 ? 'Maybe later' : 'Back'}
          </button>

          <button
            type="button"
            disabled={!canContinue}
            onClick={handleNext}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {stepIndex < totalSteps - 1 ? 'Keep going' : 'Let’s meet professionals'}
          </button>
        </div>
      </div>
    </div>
  );
}
