'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { CanonicalLocation } from '@/components/location-select';
import LocationSelect from '@/components/location-select';
import { HkDistrictList } from '@/components/hk-district-list';
import { HkDistrictMap } from '@/components/hk-district-map';
import { MapOrList } from '@/components/map-or-list';
import type { ProjectFormData } from '@/components/project-form';
import type { Professional } from '@/lib/types';
import { useAuth } from '@/context/auth-context';
import {
  getCreateProjectDraftHandoff,
  getProjectDescriptionHandoff,
  setCreateProjectDraftHandoff,
  setProjectDescriptionHandoff,
} from '@/lib/create-project-handoff';
import { writeCreateProjectDraftSafely } from '@/lib/draft-storage';
import { API_BASE_URL } from '@/config/api';
import { getUploadResponseKeys, resolveMediaAssetUrl } from '@/lib/media-assets';
import { areaCodeToCanonicalLocation, deriveProjectAreaCodeFromLocation } from '@/lib/hk-districts';

type WizardStep =
  | { kind: 'title' }
  | { kind: 'location' }
  | { kind: 'emergency' }
  | { kind: 'followup'; question: string; id: string }
  | { kind: 'scope' }
  | { kind: 'endDate' }
  | { kind: 'images' }
  | { kind: 'review' };

interface ProjectDescriptionData {
  title?: string;
  description?: string;
  projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
  isEmergency?: boolean;
  profession?: string;
  location?: CanonicalLocation;
  tradesRequired?: string[];
  followUpQuestions?: string[];
}

interface CreateProjectDraft {
  initialData?: Partial<ProjectFormData>;
  selectedProfessionals?: Professional[];
  aiIntakeId?: string;
  followUpQuestions?: string[];
}

const normalizeProjectScale = (value?: string | null): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | undefined => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SCALE_1' || normalized === 'SCALE_2' || normalized === 'SCALE_3') {
    return normalized;
  }
  return undefined;
};

const normalizeQuestions = (input: unknown): string[] =>
  Array.isArray(input)
    ? input
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const MOTIVATION = [
  'Nice! Let\'s build this in under a minute.',
  'You\'re on fire, one quick step at a time.',
  'Looking great. This is coming together.',
  'Final stretch, let\'s launch this.',
];

export default function CreateProjectWizardPage() {
  const router = useRouter();
  const { isLoggedIn, userLocation, accessToken } = useAuth();

  const [hydrated, setHydrated] = useState(false);
  const [seedDraft, setSeedDraft] = useState<CreateProjectDraft | null>(null);
  const [seedDescription, setSeedDescription] = useState<ProjectDescriptionData | null>(null);
  const [seedLoaded, setSeedLoaded] = useState(false);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [location, setLocation] = useState<CanonicalLocation>({});
  const [isEmergency, setIsEmergency] = useState<boolean | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [endDate, setEndDate] = useState('');
  const [siteInspectionAvailableOn, setSiteInspectionAvailableOn] = useState('');
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (isLoggedIn === false) {
      router.push('/');
      return;
    }
    if (isLoggedIn !== true) return;

    let parsedStoredDraft: CreateProjectDraft | null = null;
    const storedDraft = sessionStorage.getItem('createProjectDraft');
    if (storedDraft) {
      try {
        parsedStoredDraft = JSON.parse(storedDraft) as CreateProjectDraft;
      } catch {
        parsedStoredDraft = null;
      }
    }

    const memoryDraft = getCreateProjectDraftHandoff();
    const mergedDraft = parsedStoredDraft || memoryDraft
      ? {
          initialData: {
            ...(parsedStoredDraft?.initialData || {}),
            ...(memoryDraft?.initialData || {}),
          },
          selectedProfessionals:
            memoryDraft?.selectedProfessionals?.length
              ? memoryDraft.selectedProfessionals
              : parsedStoredDraft?.selectedProfessionals,
          aiIntakeId: memoryDraft?.aiIntakeId || parsedStoredDraft?.aiIntakeId,
          followUpQuestions:
            memoryDraft?.followUpQuestions?.length
              ? memoryDraft.followUpQuestions
              : parsedStoredDraft?.followUpQuestions,
        }
      : null;

    let parsedStoredDescription: ProjectDescriptionData | null = null;
    const storedDescription = sessionStorage.getItem('projectDescription');
    if (storedDescription) {
      try {
        parsedStoredDescription = JSON.parse(storedDescription) as ProjectDescriptionData;
      } catch {
        parsedStoredDescription = null;
      }
    }

    const memoryDescription = getProjectDescriptionHandoff();
    const mergedDescription = parsedStoredDescription || memoryDescription
      ? {
          ...(parsedStoredDescription || {}),
          ...(memoryDescription || {}),
        }
      : null;

    setSeedDraft(mergedDraft);
    setSeedDescription(mergedDescription);
    setSeedLoaded(true);
  }, [hydrated, isLoggedIn, router]);

  useEffect(() => {
    if (!seedLoaded) return;

    const nextTitle = seedDraft?.initialData?.projectName || seedDescription?.title || '';
    const nextSummary = seedDescription?.description || seedDraft?.initialData?.notes || '';
    const nextLocation = seedDraft?.initialData?.location || seedDescription?.location || userLocation || {};
    const nextEmergency = seedDraft?.initialData?.isEmergency ?? seedDescription?.isEmergency ?? null;
    const nextQuestions = normalizeQuestions(seedDescription?.followUpQuestions || seedDraft?.followUpQuestions || []);
    const nextEndDate = seedDraft?.initialData?.endDate || '';
    const nextSiteInspection = seedDraft?.initialData?.siteInspectionAvailableOn || '';
    const seededPhotos = Array.isArray(seedDraft?.initialData?.photoUrls)
      ? seedDraft.initialData.photoUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];

    setTitle(nextTitle);
    setSummary(nextSummary);
    setLocation(nextLocation);
    setIsEmergency(typeof nextEmergency === 'boolean' ? nextEmergency : null);
    setFollowUpQuestions(nextQuestions);
    setEndDate(nextEndDate);
    setSiteInspectionAvailableOn(nextSiteInspection);
    setExistingImageUrls(seededPhotos);
    setAnswers({});
    setCurrentStep(0);
  }, [seedLoaded, seedDraft, seedDescription, userLocation]);

  const steps = useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [{ kind: 'title' }];

    const hasLocation = Boolean(location.primary || location.secondary || location.tertiary);
    if (!hasLocation) list.push({ kind: 'location' });

    list.push({ kind: 'emergency' });

    followUpQuestions.forEach((question, index) => {
      list.push({ kind: 'followup', question, id: `q-${index}` });
    });

    list.push({ kind: 'scope' });
    list.push({ kind: 'endDate' });
    list.push({ kind: 'images' });
    list.push({ kind: 'review' });

    return list;
  }, [followUpQuestions, location.primary, location.secondary, location.tertiary]);

  const activeStep = steps[currentStep];
  const currentMotivation = MOTIVATION[Math.min(currentStep, MOTIVATION.length - 1)] || MOTIVATION[MOTIVATION.length - 1];
  const selectedProjectAreaCode = useMemo(
    () => deriveProjectAreaCodeFromLocation(location),
    [location],
  );

  const handleProjectMapSelection = (codes: string[]) => {
    const nextCode = codes[0];
    setLocation((nextCode ? areaCodeToCanonicalLocation(nextCode) : {}) as CanonicalLocation);
  };

  const seedAssumptions = seedDraft?.initialData?.aiFrom?.assumptions || [];
  const seedSummary = (seedDescription?.description || '').trim();
  const seedScope = (seedDraft?.initialData?.notes || '').trim();
  const canGoNext = useMemo(() => {
    if (!activeStep) return false;
    if (activeStep.kind === 'title') return title.trim().length > 0;
    if (activeStep.kind === 'location') return Boolean(location.primary || location.secondary || location.tertiary);
    if (activeStep.kind === 'emergency') return isEmergency !== null;
    if (activeStep.kind === 'followup') return (answers[activeStep.id] || '').trim().length > 0;
    if (activeStep.kind === 'scope') return summary.trim().length > 0;
    return true;
  }, [activeStep, title, location.primary, location.secondary, location.tertiary, isEmergency, answers, summary]);

  const progress = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;

  const goNext = () => {
    if (!canGoNext) return;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const addImageUrl = () => {
    const normalized = imageUrlDraft.trim();
    if (!normalized) return;
    if (!/^https?:\/\//i.test(normalized)) return;
    setExistingImageUrls((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setImageUrlDraft('');
  };

  const removeImageUrl = (url: string) => {
    setExistingImageUrls((prev) => prev.filter((item) => item !== url));
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pending = Array.from(files);

    setIsUploadingImages(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      pending.forEach((file) => formData.append('files', file));
      const response = await fetch(`${API_BASE_URL}/uploads`, {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || `Image upload failed (${response.status})`);
      }
      const uploadedUrls = getUploadResponseKeys(payload);
      if (uploadedUrls.length > 0) {
        setExistingImageUrls((prev) => Array.from(new Set([...prev, ...uploadedUrls])));
      }
    } catch (error) {
      setUploadError((error as Error).message || 'Failed to upload images');
    } finally {
      setIsUploadingImages(false);
    }
  };

  const submitWizard = () => {
    const followUpBlock = followUpQuestions
      .map((question, index) => {
        const answer = (answers[`q-${index}`] || '').trim();
        if (!answer) return null;
        return `Q: ${question}\nA: ${answer}`;
      })
      .filter((item): item is string => Boolean(item))
      .join('\n\n');

    const mergedSummary = [
      summary.trim(),
      followUpBlock ? `Additional Questions & Answers:\n${followUpBlock}` : '',
    ].filter(Boolean).join('\n\n');

    const resolvedRegion = [location.secondary, location.primary]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join(', ');

    const nextDraft: CreateProjectDraft = {
      initialData: {
        ...(seedDraft?.initialData || {}),
        projectName: title.trim(),
        notes: mergedSummary,
        location,
        region: resolvedRegion || seedDraft?.initialData?.region || '',
        isEmergency: Boolean(isEmergency),
        projectScale:
          normalizeProjectScale(seedDraft?.initialData?.projectScale) ||
          normalizeProjectScale(seedDescription?.projectScale) ||
          undefined,
        tradesRequired:
          seedDraft?.initialData?.tradesRequired ||
          seedDescription?.tradesRequired ||
          [],
        endDate: endDate || undefined,
        siteInspectionAvailableOn: siteInspectionAvailableOn || undefined,
        photoUrls: existingImageUrls,
      },
      selectedProfessionals: seedDraft?.selectedProfessionals || [],
      aiIntakeId: seedDraft?.aiIntakeId,
      followUpQuestions,
    };

    writeCreateProjectDraftSafely(nextDraft);
    setCreateProjectDraftHandoff(nextDraft);

    const nextDescription: ProjectDescriptionData = {
      title: nextDraft.initialData?.projectName || '',
      description: nextDraft.initialData?.notes || '',
      projectScale: normalizeProjectScale(nextDraft.initialData?.projectScale),
      isEmergency: Boolean(nextDraft.initialData?.isEmergency),
      profession: nextDraft.initialData?.tradesRequired?.[0],
      location: nextDraft.initialData?.location,
      tradesRequired: nextDraft.initialData?.tradesRequired || [],
      followUpQuestions,
    };

    setProjectDescriptionHandoff(nextDescription);
    try {
      sessionStorage.setItem('projectDescription', JSON.stringify(nextDescription));
    } catch {
      // best effort
    }

    router.push('/create-project?source=ai-wizard');
  };

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="relative isolate min-h-screen pb-10 pt-6">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="h-full w-full bg-[url('/assets/images/hero-homepage-empty.webp')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 bg-[#1a1a1a]/44" />
      </div>

      <section className="-mx-6 px-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">AI Project Wizard</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Let&apos;s frame your project before publishing</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
            Sliding wizard flow: confirm title, map location, urgency, answers, end date, and images before final review.
          </p>
        </div>
      </section>

      <section className="-mx-6 mt-6 px-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
            </p>
            <p className="text-sm font-semibold text-slate-700">{progress}% complete</p>
          </div>
          <p className="mb-4 text-sm text-slate-700">{currentMotivation}</p>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-300/60 bg-white/70">
            <div className="h-[calc(100vh-460px)] min-h-[360px] max-h-[520px] overflow-hidden">
              <div
                className="flex h-full transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${currentStep * 100}%)` }}
              >
                {steps.map((step, index) => (
                  <div key={`${step.kind}-${index}`} className="h-full w-full shrink-0 overflow-y-auto p-5 sm:p-6">
                    {step.kind === 'title' && (
                      <div className="space-y-4">
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Mini brief</p>
                          <div className="mt-1 space-y-2">
                            {seedSummary && (
                              <p><span className="font-semibold text-slate-900">Summary:</span> {seedSummary}</p>
                            )}
                            {seedScope && (
                              <p><span className="font-semibold text-slate-900">Scope:</span> {seedScope}</p>
                            )}
                            {seedAssumptions.length > 0 && (
                              <div>
                                <p className="font-semibold text-slate-900">Assumptions:</p>
                                <ul className="mt-1 list-disc space-y-1 pl-5">
                                  {seedAssumptions.slice(0, 3).map((assumption, assumptionIndex) => (
                                    <li key={`assumption-${assumptionIndex}`}>{assumption}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {!seedSummary && !seedScope && seedAssumptions.length === 0 && (
                              <p>We extracted your project details from the prompt.</p>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">📝 Shall we call this project…</p>
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Bathroom leak repair"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    )}

                    {step.kind === 'location' && (
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-slate-900">📍 Where is this project located?</p>
                        <p className="text-xs text-slate-600">We prefilled your saved area when possible. Tweak it if needed.</p>
                        <MapOrList
                          storageKey="fh-map-or-list-preference"
                          label="Project location input mode"
                          helperText="Use the district map for a visual pick, or switch to text mode."
                          mapLabel="Map"
                          listLabel="Words"
                          listPanelClassName="max-h-[38vh] overflow-y-auto pr-1"
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
                              <LocationSelect value={location} onChange={setLocation} enableSearch={true} />
                            </div>
                          }
                        />
                      </div>
                    )}

                    {step.kind === 'emergency' && (
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-slate-900">🚨 Is this an emergency project?</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setIsEmergency(false)}
                            className={`rounded-lg border px-4 py-3 text-left ${isEmergency === false ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white'}`}
                          >
                            <p className="font-semibold text-slate-900">Standard</p>
                            <p className="text-xs text-slate-600">Normal matching works perfectly.</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEmergency(true)}
                            className={`rounded-lg border px-4 py-3 text-left ${isEmergency === true ? 'border-rose-600 bg-rose-50' : 'border-slate-300 bg-white'}`}
                          >
                            <p className="font-semibold text-slate-900">Emergency</p>
                            <p className="text-xs text-slate-600">We\'ll prioritize emergency-ready professionals.</p>
                          </button>
                        </div>
                      </div>
                    )}

                    {step.kind === 'followup' && (
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-slate-900">💡 Quick pit stop</p>
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-800">{step.question}</p>
                        <textarea
                          value={answers[step.id] || ''}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [step.id]: e.target.value }))}
                          rows={4}
                          placeholder="Type your answer..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    )}

                    {step.kind === 'scope' && (
                      <div className="space-y-4">
                        <h2 className="text-xl font-bold text-slate-900">🧾 Any final notes for professionals?</h2>
                        <textarea
                          value={summary}
                          onChange={(e) => setSummary(e.target.value)}
                          rows={6}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    )}

                    {step.kind === 'endDate' && (
                      <div className="space-y-4">
                        <h2 className="text-xl font-bold text-slate-900">Preferred end date</h2>
                        <p className="text-sm text-slate-700">Same scheduling fields as create-project so timelines stay consistent.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <label className="text-sm font-medium text-slate-800">I need this completed by</label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-sm font-medium text-slate-800">I can allow site inspection on</label>
                            <input
                              type="date"
                              value={siteInspectionAvailableOn}
                              onChange={(e) => setSiteInspectionAvailableOn(e.target.value)}
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {step.kind === 'images' && (
                      <div className="space-y-4">
                        <h2 className="text-xl font-bold text-slate-900">📷 Photos</h2>
                        <p className="text-sm text-slate-700">Matches create-project behavior: keep seeded images and add more if needed.</p>

                        <div className="flex gap-2">
                          <input
                            value={imageUrlDraft}
                            onChange={(e) => setImageUrlDraft(e.target.value)}
                            placeholder="https://..."
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                          <button type="button" onClick={addImageUrl} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Add URL</button>
                        </div>

                        <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                          {isUploadingImages ? 'Uploading...' : 'Upload images'}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => uploadImages(e.target.files)}
                            disabled={isUploadingImages}
                          />
                        </label>

                        {uploadError && <p className="text-sm text-rose-700">{uploadError}</p>}

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {existingImageUrls.map((url) => (
                            <div key={url} className="rounded-lg border border-slate-200 bg-white p-2">
                              <div className="relative h-24 overflow-hidden rounded">
                                <Image src={resolveMediaAssetUrl(url)} alt="Project image" fill className="object-cover" unoptimized />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeImageUrl(url)}
                                className="mt-2 w-full rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {step.kind === 'review' && (
                      <div className="space-y-3">
                        <h2 className="text-xl font-bold text-slate-900">Review and continue</h2>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                          <p><span className="font-semibold">Title:</span> {title || 'N/A'}</p>
                          <p><span className="font-semibold">Urgency:</span> {isEmergency ? 'Emergency' : 'Standard'}</p>
                          <p><span className="font-semibold">Preferred end date:</span> {endDate || 'Not set'}</p>
                          <p><span className="font-semibold">Site inspection:</span> {siteInspectionAvailableOn || 'Not set'}</p>
                          <p><span className="font-semibold">Images:</span> {existingImageUrls.length}</p>
                          <p className="mt-2 whitespace-pre-wrap"><span className="font-semibold">Summary:</span> {summary || 'N/A'}</p>
                        </div>
                        <p className="text-sm text-slate-600">Next you&apos;ll go to final create-project review and submit.</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white/60 p-4">
              <button
                type="button"
                onClick={goBack}
                disabled={currentStep === 0}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                Back
              </button>

              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitWizard}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Continue to Create Project
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {seedLoaded && !title && !summary && followUpQuestions.length === 0 && (
        <section className="-mx-6 mt-6 px-6">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 sm:p-8">
            <p className="text-sm text-slate-800">No AI wizard data was found. Start from the home AI panel and try again.</p>
            <button
              type="button"
              onClick={() => router.push('/?focusPrompt=1')}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Back to AI Prompt
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
