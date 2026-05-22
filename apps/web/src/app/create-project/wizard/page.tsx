'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { CanonicalLocation } from '@/components/location-select';
import LocationSelect from '@/components/location-select';
import { HkDistrictList } from '@/components/hk-district-list';
import { HkDistrictMap } from '@/components/hk-district-map';
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
  | { kind: 'basics' }
  | { kind: 'location' }
  | { kind: 'followups' }
  | { kind: 'scopeDates' }
  | { kind: 'images' }
  | { kind: 'review' };

type LocationInputMode = 'map' | 'list';

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

const isLocationFollowUpQuestion = (question: string): boolean => {
  const normalized = question.toLowerCase();
  return /(location|district|area|region|neighbou?rhood|where\s+is|where\s+in|hong\s*kong|hk\b|kowloon|new\s*territories|island|address|postal|postcode|zip|estate|building)/i.test(normalized);
};

const sanitizeFollowUpQuestions = (questions: string[]): string[] =>
  questions.filter((question) => !isLocationFollowUpQuestion(question));

const mergeQuestions = (...inputs: unknown[]): string[] =>
  sanitizeFollowUpQuestions(Array.from(new Set(inputs.flatMap((input) => normalizeQuestions(input)))));

const stripSummaryPrefix = (value: string): string => {
  const trimmed = value.trimStart();
  if (/^summary\s*:\s*/i.test(trimmed)) {
    return trimmed.replace(/^summary\s*:\s*/i, '').trimStart();
  }
  return value;
};

const MOTIVATION = [
  'Nice! Let\'s build this in under a minute.',
  'You\'re on fire, one quick step at a time.',
  'Looking great. This is coming together.',
  'Final stretch, let\'s launch this.',
];

const panelTitleClass = 'flex items-start gap-2 text-xl font-semibold text-slate-900 sm:text-2xl';
const panelNoteClass = 'text-sm leading-relaxed text-slate-700';
const panelCardClass = 'space-y-4';
const panelContentClass = 'flex h-full min-h-0 flex-col gap-4';
const LOCATION_PICKER_HEIGHT_RATIO = 300 / 768;

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
  const [locationInputMode, setLocationInputMode] = useState<LocationInputMode>(() => {
    if (typeof window === 'undefined') return 'map';
    try {
      const storedMode = window.localStorage.getItem('fh-map-or-list-preference');
      return storedMode === 'list' ? 'list' : 'map';
    } catch {
      return 'map';
    }
  });

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
          followUpQuestions: mergeQuestions(
            parsedStoredDescription?.followUpQuestions,
            memoryDescription?.followUpQuestions,
          ),
        }
      : null;

    setSeedDraft(mergedDraft);
    setSeedDescription(mergedDescription);
    setSeedLoaded(true);
  }, [hydrated, isLoggedIn, router]);

  useEffect(() => {
    if (!seedLoaded) return;

    const nextTitle = seedDraft?.initialData?.projectName || seedDescription?.title || '';
    const nextSummaryRaw = seedDescription?.description || seedDraft?.initialData?.notes || '';
    const nextSummary = stripSummaryPrefix(nextSummaryRaw);
    const nextLocation = seedDraft?.initialData?.location || seedDescription?.location || userLocation || {};
    const nextEmergency = seedDraft?.initialData?.isEmergency ?? seedDescription?.isEmergency ?? null;
    const nextQuestions = mergeQuestions(seedDescription?.followUpQuestions, seedDraft?.followUpQuestions);
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

  const followUpStepQuestions = useMemo(() => followUpQuestions.slice(0, 2), [followUpQuestions]);

  const steps = useMemo<WizardStep[]>(
    () => [
      { kind: 'basics' },
      { kind: 'location' },
      { kind: 'followups' },
      { kind: 'scopeDates' },
      { kind: 'images' },
      { kind: 'review' },
    ],
    [],
  );

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
    if (activeStep.kind === 'basics') return title.trim().length > 0;
    if (activeStep.kind === 'location') return Boolean(location.primary || location.secondary || location.tertiary);
    if (activeStep.kind === 'followups') return true;
    if (activeStep.kind === 'scopeDates') return summary.trim().length > 0;
    return true;
  }, [activeStep, title, location.primary, location.secondary, location.tertiary, followUpStepQuestions, summary]);

  const progress = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;

  const goNext = () => {
    if (!canGoNext) return;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleLocationInputMode = (nextMode: LocationInputMode) => {
    setLocationInputMode(nextMode);
    try {
      window.localStorage.setItem('fh-map-or-list-preference', nextMode);
    } catch {
      // no-op
    }
  };

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
    const followUpBlock = followUpStepQuestions
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
      followUpQuestions: followUpStepQuestions,
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
      followUpQuestions: followUpStepQuestions,
    };

    setProjectDescriptionHandoff(nextDescription);
    try {
      sessionStorage.setItem('projectDescription', JSON.stringify(nextDescription));
    } catch {
      // best effort
    }

    const params = new URLSearchParams();
    const selectedTrades = nextDraft.initialData?.tradesRequired || [];
    if (selectedTrades[0]) params.set('trade', selectedTrades[0]);
    if (selectedTrades.length > 0) params.set('trades', selectedTrades.join(','));
    if (location.tertiary) params.set('location', location.tertiary);
    else if (location.secondary) params.set('location', location.secondary);
    else if (location.primary) params.set('location', location.primary);
    else params.set('askRegion', '1');
    if (nextDraft.initialData?.projectName) {
      params.set('aiTitle', nextDraft.initialData.projectName.slice(0, 180));
    }
    if (nextDraft.initialData?.notes) {
      params.set('aiScope', nextDraft.initialData.notes.slice(0, 1800));
    }
    if (nextDraft.initialData?.projectScale) {
      params.set('aiScale', nextDraft.initialData.projectScale);
    }
    params.set('aiEmergency', nextDraft.initialData?.isEmergency ? '1' : '0');
    params.set('source', 'ai-wizard');

    router.push(`/professionals?${params.toString()}`);
  };

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen pb-6 pt-3">
      <section className="-mx-6 px-6">
        <div className="mx-auto flex h-[calc(100dvh-2rem)] max-w-6xl flex-col rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
              AI Project Wizard · Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
            </p>
            <p className="text-base font-semibold text-slate-700">{progress}% complete</p>
          </div>
          <p className="mb-4 text-base text-slate-700">{currentMotivation}</p>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300/60 bg-white/70">
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className="flex h-full transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${currentStep * 100}%)` }}
              >
                {steps.map((step, index) => (
                  <div
                    key={`${step.kind}-${index}`}
                    className={`flex h-full w-full shrink-0 flex-col p-5 pb-24 sm:p-6 sm:pb-24 ${
                      step.kind === 'location' ? 'overflow-hidden' : 'overflow-y-auto'
                    }`}
                  >
                    {step.kind === 'basics' && (
                      <div className={panelContentClass}>
                        <h3 className={panelTitleClass}><span>📝</span><span>Project basics</span></h3>
                        <p className={panelNoteClass}>Give your project a clear title and set urgency.</p>
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Bathroom leak repair"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
                        />
                        <label className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={isEmergency === true}
                            onChange={(e) => setIsEmergency(e.target.checked)}
                            className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-base font-medium text-slate-900">This is an urgent request</span>
                        </label>
                      </div>
                    )}

                    {step.kind === 'location' && (
                      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className={panelTitleClass}><span>📍</span><span>Where is this project located?</span></h3>
                          <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              type="button"
                              onClick={() => handleLocationInputMode('map')}
                              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                                locationInputMode === 'map'
                                  ? 'bg-orange-600 text-amber-50 shadow-md'
                                  : 'bg-slate-400 text-amber-50 hover:bg-slate-500'
                              }`}
                            >
                              Map
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLocationInputMode('list')}
                              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                                locationInputMode === 'list'
                                  ? 'bg-orange-600 text-amber-50 shadow-md'
                                  : 'bg-slate-400 text-amber-50 hover:bg-slate-500'
                              }`}
                            >
                              Words
                            </button>
                          </div>
                        </div>

                        <div
                          className="min-h-0 overflow-hidden"
                          style={{
                            height: `min(100%, calc(100dvh * ${LOCATION_PICKER_HEIGHT_RATIO}))`,
                          }}
                        >
                          {locationInputMode === 'map' ? (
                            <div className="h-full overflow-hidden pr-1">
                              <HkDistrictMap
                                selectionMode="single"
                                selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                                onChange={handleProjectMapSelection}
                                compact={true}
                              />
                            </div>
                          ) : (
                            <div className="h-full overflow-auto space-y-3 pr-1">
                              <HkDistrictList
                                selectionMode="single"
                                selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                                onChange={handleProjectMapSelection}
                              />
                              <div className="hidden">
                                <LocationSelect value={location} onChange={setLocation} enableSearch={true} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {step.kind === 'followups' && (
                      <div className={panelContentClass}>
                        <h3 className={panelTitleClass}><span>💡</span><span>Clarifications</span></h3>
                        <p className={panelNoteClass}>Answer these quick questions so we can brief professionals properly.</p>
                        <div className="space-y-3">
                          {followUpStepQuestions.length === 0 ? (
                            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">No clarification questions at this time.</p>
                          ) : (
                            followUpStepQuestions.map((question, index) => {
                              const answerKey = `q-${index}`;
                              return (
                                <div key={answerKey} className="space-y-1.5">
                                  <p className={panelNoteClass}>{question}</p>
                                  <textarea
                                    value={answers[answerKey] || ''}
                                    onChange={(e) => setAnswers((prev) => ({ ...prev, [answerKey]: e.target.value }))}
                                    rows={2}
                                    placeholder="Type your answer..."
                                    className="w-full min-h-[88px] rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
                                  />
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {step.kind === 'scopeDates' && (
                      <div className={panelContentClass}>
                        <h3 className={panelTitleClass}><span>🧾</span><span>Scope and dates</span></h3>
                        <p className={panelNoteClass}>Anything else you want to share before we lock in?</p>
                        <textarea
                          value={summary}
                          onChange={(e) => setSummary(e.target.value)}
                          rows={3}
                          placeholder="Add any additional context or requirements..."
                          className="w-full min-h-[110px] rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
                        />
                        <div className="grid gap-4">
                          <div className="grid gap-1.5">
                            <p className={panelNoteClass}>Date you can allow site inspection.</p>
                            <p className="text-sm italic text-slate-600">Allowing access for site inspection will ensure more complete project understanding and so higher quality, more reliable quotations, without surprises.</p>
                            <input
                              type="date"
                              value={siteInspectionAvailableOn}
                              onChange={(e) => setSiteInspectionAvailableOn(e.target.value)}
                              className="rounded-md border border-slate-300 px-3 py-3 text-base"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <p className={panelNoteClass}>When do you need this completed by?</p>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="rounded-md border border-slate-300 px-3 py-3 text-base"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {step.kind === 'images' && (
                      <div className={panelContentClass}>
                        <h3 className={panelTitleClass}><span>📷</span><span>Photos, documents and other information.</span></h3>
                        <p className={panelNoteClass}>Please share photos of the site, plans, and any other documents you think might help your team understand the project better.</p>

                        <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-3 py-3 text-base font-semibold text-white hover:bg-emerald-700">
                          {isUploadingImages ? 'Uploading...' : 'Upload images, documents or photos'}
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

                        <div className="space-y-2">
                          <p className={panelNoteClass}>Filmstrip of images already associated.</p>
                          <div className="flex gap-3 overflow-x-auto pb-1">
                            {existingImageUrls.map((url) => (
                              <div key={url} className="min-w-32 rounded-lg border border-slate-200 bg-white p-2">
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
                      </div>
                    )}

                    {step.kind === 'review' && (
                      <div className={panelContentClass}>
                        <h3 className={panelTitleClass}><span>✅</span><span>Review and save</span></h3>
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <div className="text-base overflow-x-auto">
                            {[
                              ['Title', title || 'N/A'],
                              ['Emergency', isEmergency ? 'Yes' : 'No'],
                              ['Follow-up questions', followUpStepQuestions.length ? `${followUpStepQuestions.length}` : 'None'],
                              ['Site inspection', siteInspectionAvailableOn || 'Not set'],
                              ['Completion date', endDate || 'Not set'],
                              ['Photos', `${existingImageUrls.length}`],
                            ].map(([label, value], rowIndex, rows) => (
                              <div
                                key={label}
                                className={`grid grid-cols-2 sm:grid-cols-[180px_minmax(0,1fr)] ${rowIndex < rows.length - 1 ? 'border-b border-slate-200' : ''}`}
                              >
                                <div className="border-r border-slate-200 bg-slate-50 px-4 py-3 text-right font-semibold text-slate-700">{label}</div>
                                <div className="px-4 py-3 text-left text-slate-900">{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={currentStep === 0}
                className="pointer-events-auto rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-800 disabled:opacity-50"
              >
                Back
              </button>

              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="pointer-events-auto rounded-lg bg-emerald-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitWizard}
                  className="pointer-events-auto rounded-lg bg-emerald-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-emerald-700 transition"
                >
                  Continue to Invite Professionals
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
