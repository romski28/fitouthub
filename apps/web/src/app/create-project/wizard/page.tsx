'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
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
type WizardMode = 'ai' | 'classic';

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

interface WizardChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

interface AiVisionReviewSnapshot {
  summary: string;
  conditionFindings: string[];
  safetyFlags: string[];
  followUpQuestions: string[];
  confidence: number | null;
  processedImageCount: number;
  provider: string | null;
  model: string | null;
}

const AI_SUMMARY_CONFIDENCE_THRESHOLD = 0.74;
const AI_CHAT_MAX_IMAGES_PER_TURN = 2;

const firstNonEmptyStringArray = (...inputs: unknown[]): string[] => {
  for (const input of inputs) {
    if (!Array.isArray(input)) continue;

    const normalized = input
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
};

const normalizeUniqueStringList = (...inputs: unknown[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const input of inputs) {
    if (!Array.isArray(input)) continue;

    for (const item of input) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(trimmed);
    }
  }

  return normalized;
};

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

const isBudgetOrTimelineFollowUpQuestion = (question: string): boolean => {
  const normalized = question.toLowerCase();
  return /(budget|price|cost|how\s+much|spend|timeline|when\s+do\s+you\s+need|completion\s+date|deadline|finish\s+by|site\s*inspection|inspection\s+date|target\s+date|due\s+date)/i.test(normalized);
};

const sanitizeFollowUpQuestions = (questions: string[]): string[] =>
  questions.filter((question) => !isLocationFollowUpQuestion(question) && !isBudgetOrTimelineFollowUpQuestion(question));

const normalizeQuestionKey = (question: string): string =>
  question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const areQuestionsNearDuplicate = (a: string, b: string): boolean => {
  const keyA = normalizeQuestionKey(a);
  const keyB = normalizeQuestionKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  if (keyA.includes(keyB) || keyB.includes(keyA)) return true;

  const tokensA = new Set(keyA.split(' ').filter((token) => token.length > 2));
  const tokensB = new Set(keyB.split(' ').filter((token) => token.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const minSize = Math.min(tokensA.size, tokensB.size);
  return minSize > 0 && overlap / minSize >= 0.7;
};

const mergeQuestions = (...inputs: unknown[]): string[] =>
  sanitizeFollowUpQuestions(Array.from(new Set(inputs.flatMap((input) => normalizeQuestions(input)))));

const getNextBestMissingBriefQuestion = (context: {
  title: string;
  summary: string;
  trades: string[];
  isEmergency: boolean | null;
}): string | null => {
  if (!context.title.trim()) {
    return 'What short project title should we use for this work?';
  }
  if (context.trades.length === 0) {
    return 'Which parts of the room are included in this scope so I can lock the right trade match?';
  }
  if (context.summary.trim().length < 90) {
    return 'Can you confirm the key deliverables and finish expectations in one message?';
  }
  if (context.isEmergency === null) {
    return 'Is this urgent or can it be planned as a normal timeline project?';
  }
  return null;
};

const stripSummaryPrefix = (value: string): string => {
  const trimmed = value.trimStart();
  if (/^summary\s*:\s*/i.test(trimmed)) {
    return trimmed.replace(/^summary\s*:\s*/i, '').trimStart();
  }
  return value;
};

const SUMMARY_CONFIRMATION_PREFIX = 'Mimo summary for confirmation:';

const MOTIVATION = [
  'Nice! Let\'s build this in under a minute.',
  'You\'re on fire, one quick step at a time.',
  'Looking great. This is coming together.',
  'Final stretch, let\'s launch this.',
];

const panelTitleClass = 'flex items-start gap-2 text-lg font-semibold text-slate-900 sm:text-xl';
const panelNoteClass = 'text-xs leading-relaxed text-slate-700 sm:text-sm';
const panelContentClass = 'flex h-full min-h-0 flex-col gap-3 sm:gap-4';
const LOCATION_PICKER_CONTAINER_CLASS = 'min-h-[300px] flex-1 overflow-hidden';

export default function CreateProjectWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, userLocation, accessToken } = useAuth();

  const [hydrated, setHydrated] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode | null>(null);
  const [seedDraft, setSeedDraft] = useState<CreateProjectDraft | null>(null);
  const [seedDescription, setSeedDescription] = useState<ProjectDescriptionData | null>(null);
  const [seedLoaded, setSeedLoaded] = useState(false);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [location, setLocation] = useState<CanonicalLocation>({});
  const [isEmergency, setIsEmergency] = useState<boolean | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<WizardChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatImageUrls, setChatImageUrls] = useState<string[]>([]);
  const [chatImageUploadBusy, setChatImageUploadBusy] = useState(false);
  const [chatImageError, setChatImageError] = useState<string | null>(null);
  const [aiChatCanContinue, setAiChatCanContinue] = useState(false);
  const [aiSummaryForConfirmation, setAiSummaryForConfirmation] = useState<string | null>(null);
  const [aiVisionReview, setAiVisionReview] = useState<AiVisionReviewSnapshot | null>(null);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [currentAiIntakeId, setCurrentAiIntakeId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [endDate, setEndDate] = useState('');
  const [siteInspectionAvailableOn, setSiteInspectionAvailableOn] = useState('');
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
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
  const hasInitializedFromSeedRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasManualStepNavigationRef = useRef(false);

  const createAiSessionId = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `wiz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    // Defensive reset when route query context is re-evaluated.
    // This prevents preserved client state from reopening mid-wizard.
    hasInitializedFromSeedRef.current = false;
    hasManualStepNavigationRef.current = false;
    setAiChatCanContinue(false);
    setCurrentStep(0);
    setAiVisionReview(null);

    const requestedMode = (searchParams.get('wizard') || '').trim().toLowerCase();
    const source = (searchParams.get('source') || '').trim().toLowerCase();

    if (requestedMode === 'ai' || requestedMode === 'classic') {
      setWizardMode(requestedMode);
      return;
    }

    if (source === 'ai') {
      setWizardMode('ai');
      return;
    }

    setWizardMode(null);
  }, [hydrated, searchParams]);

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
    if (hasInitializedFromSeedRef.current) return;

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
    setChatError(null);
    setChatImageError(null);
    setAiChatCanContinue(false);
    setAiSummaryForConfirmation(null);
    setCurrentAiIntakeId(seedDraft?.aiIntakeId || null);

    const openingSummary = nextSummary || nextTitle;
    const starterText = openingSummary
      ? `Great start. I can help shape this into a clear project brief without making it feel like homework. ${openingSummary}`
      : 'Nice, let\'s make this easy. I\'ll help you build a clear brief step by step so pros can quote with fewer surprises.';
    const firstQuestion = sanitizeFollowUpQuestions(normalizeQuestions(nextQuestions))[0] || null;
    const seedMessages: WizardChatMessage[] = [{ role: 'assistant', text: starterText }];
    if (firstQuestion) seedMessages.push({ role: 'assistant', text: firstQuestion });
    setChatMessages(seedMessages);

    setEndDate(nextEndDate);
    setSiteInspectionAvailableOn(nextSiteInspection);
    setExistingImageUrls(seededPhotos);
    setAnswers({});
    setCurrentStep(0);
    hasInitializedFromSeedRef.current = true;
  }, [seedLoaded, seedDraft, seedDescription, userLocation]);

  useEffect(() => {
    if (!hydrated) return;
    if (aiSessionId) return;
    setAiSessionId(createAiSessionId());
  }, [hydrated, aiSessionId]);

  useEffect(() => {
    if (wizardMode === null) return;
    hasManualStepNavigationRef.current = false;
    setCurrentStep(0);
  }, [wizardMode]);

  useEffect(() => {
    if (wizardMode === null) return;
    if (hasManualStepNavigationRef.current) return;
    if (currentStep !== 0) {
      setCurrentStep(0);
    }
  }, [wizardMode, currentStep]);

  const followUpStepQuestions = useMemo(() => followUpQuestions.slice(0, 2), [followUpQuestions]);

  const renderChatMessageBody = (message: WizardChatMessage) => {
    if (message.role !== 'assistant' || !message.text.startsWith(SUMMARY_CONFIRMATION_PREFIX)) {
      return message.text;
    }

    const [summaryBlock, continuationRaw] = message.text.split('\n\nIf this looks right,');
    const summaryLines = summaryBlock
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const heading = summaryLines[0] || SUMMARY_CONFIRMATION_PREFIX;
    const fieldRows = summaryLines
      .slice(1)
      .map((line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex < 0) {
          return { label: 'Note', value: line };
        }

        return {
          label: line.slice(0, separatorIndex).trim(),
          value: line.slice(separatorIndex + 1).trim(),
        };
      })
      .filter((row) => row.value.length > 0);

    const continuationText = continuationRaw
      ? `If this looks right,${continuationRaw}`.trim()
      : '';

    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-900">{heading}</p>
        <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
          {fieldRows.map((row, rowIndex) => (
            <div key={`${row.label}-${rowIndex}`} className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 text-xs sm:text-sm">
              <span className="font-semibold text-slate-700">{row.label}</span>
              <span className="text-slate-800">{row.value}</span>
            </div>
          ))}
        </div>
        {continuationText && <p className="text-xs text-slate-600">{continuationText}</p>}
      </div>
    );
  };

  const steps = useMemo<WizardStep[]>(
    () => {
      const base: WizardStep[] = [
        { kind: 'basics' },
        { kind: 'location' },
      ];

      if (wizardMode !== 'classic') {
        base.push({ kind: 'followups' });
      }

      base.push(
        { kind: 'scopeDates' },
        { kind: 'images' },
        { kind: 'review' },
      );

      return base;
    },
    [wizardMode],
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

  const canGoNext = useMemo(() => {
    if (!activeStep) return false;
    if (activeStep.kind === 'basics') return title.trim().length > 0;
    if (activeStep.kind === 'location') return Boolean(location.primary || location.secondary || location.tertiary);
    if (activeStep.kind === 'followups') return true;
    if (activeStep.kind === 'scopeDates') return summary.trim().length > 0;
    return true;
  }, [activeStep, title, location.primary, location.secondary, location.tertiary, summary]);

  const progress = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;
  const repairSignalText = [title, summary, seedDescription?.description || '', seedDescription?.title || ''].join(' ').toLowerCase();
  const isLikelyRepairMode = /(repair|fix|broken|damage|damaged|leak|leaking|replace|urgent maintenance|maintenance)/i.test(repairSignalText);
  const suggestedPath: 'ai' | 'fast-track' = isLikelyRepairMode ? 'fast-track' : 'ai';

  useEffect(() => {
    if (wizardMode !== 'ai') return;
    if (activeStep?.kind !== 'followups') return;
    const node = chatContainerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [wizardMode, activeStep, chatMessages, chatBusy]);

  const goNext = () => {
    if (!canGoNext) return;
    hasManualStepNavigationRef.current = true;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => {
    hasManualStepNavigationRef.current = true;
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleAiContinue = () => {
    setAiChatCanContinue(false);
    goNext();
  };

  const handleLocationInputMode = (nextMode: LocationInputMode) => {
    setLocationInputMode(nextMode);
    try {
      window.localStorage.setItem('fh-map-or-list-preference', nextMode);
    } catch {
      // no-op
    }
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

  const removeChatImageUrl = (url: string) => {
    setChatImageUrls((prev) => prev.filter((item) => item !== url));
  };

  const uploadChatImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pending = Array.from(files);
    const remainingSlots = Math.max(0, AI_CHAT_MAX_IMAGES_PER_TURN - chatImageUrls.length);
    if (remainingSlots <= 0) {
      setChatImageError(`You can attach up to ${AI_CHAT_MAX_IMAGES_PER_TURN} images per message.`);
      return;
    }

    const filesToUpload = pending.slice(0, remainingSlots);
    if (filesToUpload.length < pending.length) {
      setChatImageError(`Only ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'} can be attached for this message.`);
    } else {
      setChatImageError(null);
    }

    setChatImageUploadBusy(true);
    try {
      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append('files', file));
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
        setChatImageUrls((prev) => Array.from(new Set([...prev, ...uploadedUrls])).slice(0, AI_CHAT_MAX_IMAGES_PER_TURN));
      }
    } catch (error) {
      setChatImageError((error as Error).message || 'Failed to upload chat images');
    } finally {
      setChatImageUploadBusy(false);
    }
  };

  const sendWizardAiTurn = async () => {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) return;
    const turnImageUrls = chatImageUrls.slice(0, AI_CHAT_MAX_IMAGES_PER_TURN);
    const effectiveSessionId = aiSessionId || createAiSessionId();

    if (!aiSessionId) {
      setAiSessionId(effectiveSessionId);
    }

    setChatInput('');
    setChatBusy(true);
    setChatError(null);
    setAiChatCanContinue(false);
    setAiSummaryForConfirmation(null);
    setChatMessages((prev) => [...prev, { role: 'user', text: prompt }]);

    try {
      const response = await fetch(`${API_BASE_URL}/ai/sandbox/requirements/conversational`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          sessionId: effectiveSessionId,
          intakeId: currentAiIntakeId || seedDraft?.aiIntakeId || undefined,
          imageUrls: turnImageUrls,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || `AI wizard request failed (${response.status})`);
      }

      const parsed = payload?.parsedOutput && typeof payload.parsedOutput === 'object'
        ? (payload.parsedOutput as Record<string, unknown>)
        : null;

      const nextConversationalText = typeof payload?.conversationalText === 'string' && payload.conversationalText.trim().length > 0
        ? payload.conversationalText.trim()
        : (typeof parsed?.conversationalText === 'string' && parsed.conversationalText.trim().length > 0
            ? parsed.conversationalText.trim()
            : 'Nice update. I captured that. We are building a strong brief together.');

      const imageInsights =
        parsed?.project && typeof parsed.project === 'object' && !Array.isArray(parsed.project)
          ? ((parsed.project as Record<string, unknown>).imageInsights as Record<string, unknown> | undefined)
          : undefined;
      const imageInsightSummary = typeof imageInsights?.summary === 'string' ? imageInsights.summary.trim() : '';
      const imageConditionFindings = Array.isArray(imageInsights?.conditionFindings)
        ? imageInsights.conditionFindings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const imageSafetyFlags = Array.isArray(imageInsights?.safetyFlags)
        ? imageInsights.safetyFlags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const imageFollowUpQuestions = Array.isArray(imageInsights?.followUpQuestions)
        ? imageInsights.followUpQuestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const processedImageCount =
        payload?.vision?.usage && typeof payload.vision.usage === 'object' && typeof payload.vision.usage.processedImageCount === 'number'
          ? payload.vision.usage.processedImageCount
          : turnImageUrls.length;
      const imageConfidence = typeof imageInsights?.confidence === 'number' ? imageInsights.confidence : null;
      const imageProvider = typeof imageInsights?.provider === 'string' ? imageInsights.provider : null;
      const imageModel = typeof imageInsights?.model === 'string' ? imageInsights.model : null;
      const imageWorkflowNote = turnImageUrls.length > 0
        ? (imageInsightSummary
            ? `I reviewed ${processedImageCount} image${processedImageCount === 1 ? '' : 's'} and used them in this reply. Visual summary: ${imageInsightSummary}`
            : `I reviewed ${processedImageCount} image${processedImageCount === 1 ? '' : 's'} and used them in this reply. I also added them to your project photos for final review.`)
        : null;

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: imageWorkflowNote ? `${nextConversationalText}\n\n${imageWorkflowNote}` : nextConversationalText },
      ]);

      const nextTitle = typeof parsed?.title === 'string' && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : title;
      const parsedScope = typeof parsed?.scope === 'string' && parsed.scope.trim().length > 0
        ? parsed.scope.trim()
        : (typeof parsed?.summary === 'string' && parsed.summary.trim().length > 0 ? parsed.summary.trim() : '');
      const nextSummary = parsedScope || summary;

      const parsedTrades = Array.isArray(parsed?.trades)
        ? parsed.trades.filter((item): item is string => typeof item === 'string')
        : [];
      const mergedTrades = normalizeUniqueStringList(
        parsedTrades,
        seedDraft?.initialData?.tradesRequired,
        seedDescription?.tradesRequired,
      );

      const parsedQuestions = sanitizeFollowUpQuestions(
        Array.from(
          new Set(
            [
              ...(Array.isArray(parsed?.nextQuestions) ? parsed.nextQuestions : []),
              ...(Array.isArray(parsed?.followUpQuestions) ? parsed.followUpQuestions : []),
              ...(Array.isArray(parsed?.missingInfo) ? parsed.missingInfo : []),
            ].filter((q): q is string => typeof q === 'string' && q.trim().length > 0),
          ),
        ),
      );

      const priorAssistantQuestions = [
        ...chatMessages
          .filter((message) => message.role === 'assistant')
          .map((message) => message.text),
        ...followUpQuestions,
      ];
      const dedupedParsedQuestions = parsedQuestions.filter(
        (candidate, index, all) =>
          !priorAssistantQuestions.some((existing) => areQuestionsNearDuplicate(candidate, existing)) &&
          all.findIndex((item) => areQuestionsNearDuplicate(item, candidate)) === index,
      );

      const askedAssistantQuestionKeys = new Set(
        chatMessages
          .filter((message) => message.role === 'assistant')
          .map((message) => normalizeQuestionKey(message.text))
          .filter((key) => key.length > 0),
      );
          const nextUnaskedQuestion = dedupedParsedQuestions.find((question) => !askedAssistantQuestionKeys.has(normalizeQuestionKey(question))) || null;
      const overallConfidence = typeof parsed?.overallConfidence === 'number' ? parsed.overallConfidence : null;
      const hasCoreBrief = Boolean(nextTitle && nextSummary && mergedTrades.length > 0);
      const shouldOfferSummaryConfirmation = hasCoreBrief && Boolean(overallConfidence !== null && overallConfidence >= AI_SUMMARY_CONFIDENCE_THRESHOLD);

      if (nextTitle) setTitle(nextTitle);
      if (nextSummary) setSummary(nextSummary);
      if (mergedTrades.length > 0) {
        setSeedDraft((prev) => ({
          ...(prev || {}),
          initialData: {
            ...(prev?.initialData || {}),
            tradesRequired: mergedTrades,
          },
        }));
      }
      if (dedupedParsedQuestions.length > 0) {
        setFollowUpQuestions(dedupedParsedQuestions);
      }

      const nextIntakeId = typeof payload?.intakeId === 'string' && payload.intakeId.trim().length > 0
        ? payload.intakeId.trim()
        : null;
      if (nextIntakeId) {
        setCurrentAiIntakeId(nextIntakeId);
      }

      if (turnImageUrls.length > 0) {
        setExistingImageUrls((prev) => Array.from(new Set([...prev, ...turnImageUrls])));
        setAiVisionReview({
          summary: imageInsightSummary,
          conditionFindings: imageConditionFindings,
          safetyFlags: imageSafetyFlags,
          followUpQuestions: imageFollowUpQuestions,
          confidence: imageConfidence,
          processedImageCount,
          provider: imageProvider,
          model: imageModel,
        });
      }

      // Inject the first next-question as the next chat prompt so it appears inside the conversation
      if (nextUnaskedQuestion) {
        setAiChatCanContinue(false);
        setChatMessages((prev) => [...prev, { role: 'assistant', text: nextUnaskedQuestion }]);
      } else if (shouldOfferSummaryConfirmation) {
        const summaryForConfirmation = [
          'Mimo summary for confirmation:',
          '',
          `Title: ${nextTitle || title || 'Not set'}`,
          `Project: ${nextTitle || title || 'Not set'}`,
          '',
          `Scope: ${nextSummary || summary || 'Not set'}`,
          '',
          `Suggested trades: ${mergedTrades.length > 0 ? mergedTrades.join(', ') : 'Not set'}`,
          `Urgency: ${(typeof isEmergency === 'boolean' ? isEmergency : null) === true ? 'Urgent' : 'Standard'}`,
          '',
          `Summary: ${nextSummary || summary || 'Not set'}`,
        ].join('\n');

        setAiSummaryForConfirmation(summaryForConfirmation);
        setAiChatCanContinue(true);
        setChatMessages((prev) => [...prev, { role: 'assistant', text: `${summaryForConfirmation}\n\nIf this looks right, continue and we will finalize the remaining details.` }]);
      } else {
        const fallbackQuestion = getNextBestMissingBriefQuestion({
          title: nextTitle || title,
          summary: nextSummary || summary,
          trades: mergedTrades,
          isEmergency,
        });

        if (fallbackQuestion) {
          setAiChatCanContinue(false);
          setChatMessages((prev) => [...prev, { role: 'assistant', text: fallbackQuestion }]);
        } else {
          const completionText = 'Great, this is clear enough to move forward. Continue when you are ready and we will finalize details for professionals.';
          setAiChatCanContinue(true);
          setChatMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.role === 'assistant' && lastMessage.text === completionText) {
              return prev;
            }
            return [...prev, { role: 'assistant', text: completionText }];
          });
        }
      }

      setChatImageUrls([]);
      setChatImageError(null);
    } catch (error) {
      setChatError((error as Error).message || 'Unable to continue AI chat right now.');
    } finally {
      setChatBusy(false);
    }
  };

  const submitWizard = () => {
    const firstResolvedTrades = firstNonEmptyStringArray(
      seedDraft?.initialData?.tradesRequired,
      seedDescription?.tradesRequired,
    );
    const professionFallback = typeof seedDescription?.profession === 'string'
      ? seedDescription.profession.trim()
      : '';
    const resolvedTradesRequired = normalizeUniqueStringList(
      firstResolvedTrades,
      professionFallback ? [professionFallback] : [],
    );

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
        tradesRequired: resolvedTradesRequired,
        endDate: endDate || undefined,
        siteInspectionAvailableOn: siteInspectionAvailableOn || undefined,
        photoUrls: existingImageUrls,
      },
      selectedProfessionals: seedDraft?.selectedProfessionals || [],
      aiIntakeId: currentAiIntakeId || seedDraft?.aiIntakeId,
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
    params.set('source', wizardMode === 'classic' ? 'classic-wizard' : 'ai-wizard');

    router.push(`/professionals?${params.toString()}`);
  };

  const handleTalkToPersonNow = () => {
    const initialMessage = [
      'General enquiry',
      title.trim() ? `Project title: ${title.trim()}` : '',
      summary.trim() ? `Project scope: ${summary.trim()}` : '',
    ].filter(Boolean).join('\n\n');

    window.dispatchEvent(
      new CustomEvent('foh-open-chat', {
        detail: {
          context: 'project_creation',
          projectName: title.trim() || 'Project scoping help',
          initialMessage,
        },
      }),
    );
  };

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen" />;
  }

  if (wizardMode === null) {
    return (
      <div className="min-h-screen pb-6 pt-6">
        <section className="-mx-6 px-6">
          <div className="mx-auto max-w-5xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 sm:p-8">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Fork Screen</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Choose your path</h1>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setWizardMode('classic')}
                className="rounded-2xl border border-slate-300 bg-white p-5 text-left transition hover:border-slate-400 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold text-slate-900">Fast track</p>
                  {suggestedPath === 'fast-track' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Suggested
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">Less questions. Fast to tender. More details later.</p>
                <span className="mt-4 inline-flex rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
                  Fast track
                </span>
              </button>

              <button
                type="button"
                onClick={() => setWizardMode('ai')}
                className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-left transition hover:border-emerald-400 hover:bg-emerald-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold text-emerald-900">✨ AI chat</p>
                  {suggestedPath === 'ai' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Suggested
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-emerald-900">Our AI works with you to complete your project narrative.</p>
                <span className="mt-4 inline-flex rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
                  AI chat
                </span>
              </button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-700">You can talk to us directly at any time. Use the AI to get your ideas together first and then reach out when you have your basics set.</p>
              <button
                type="button"
                onClick={handleTalkToPersonNow}
                className="mt-3 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700"
              >
                Book a chat
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-1 pt-0 sm:pb-2 sm:pt-0.5">
      <section className="-mx-6 px-6">
        <div className="mx-auto flex h-[calc(100dvh-6rem)] max-h-[calc(100dvh-6rem)] min-h-0 max-w-6xl flex-col rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-2.5 sm:h-[calc(100dvh-6.25rem)] sm:max-h-[calc(100dvh-6.25rem)] sm:p-3">
          <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2 sm:items-center sm:gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 sm:text-xs sm:tracking-[0.1em]">
                {wizardMode === 'classic' ? 'Project Wizard' : 'AI Project Wizard'} · Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-600 sm:text-xs">{currentMotivation}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-[11px] font-semibold text-slate-700 sm:text-xs">{progress}%</p>
              <div className="h-1 w-14 overflow-hidden rounded-full bg-white/80 sm:w-16">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
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
                    className={`flex h-full w-full shrink-0 flex-col p-3 pb-16 sm:p-4 ${
                      step.kind === 'followups' && wizardMode === 'ai' ? 'sm:pb-4' : 'sm:pb-16'
                    } ${
                      step.kind === 'location' || step.kind === 'followups' ? 'overflow-hidden' : 'overflow-y-auto'
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
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm sm:text-base"
                        />
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5 hover:bg-slate-50 sm:px-4 sm:py-3">
                          <input
                            type="checkbox"
                            checked={isEmergency === true}
                            onChange={(e) => setIsEmergency(e.target.checked)}
                            className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-medium text-slate-900 sm:text-base">This is an urgent request</span>
                        </label>
                      </div>
                    )}

                    {step.kind === 'location' && (
                      <div className="flex h-full min-h-0 flex-col gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className={panelTitleClass}><span>📍</span><span>Where is this project located?</span></h3>
                          <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              type="button"
                              onClick={() => handleLocationInputMode('map')}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:py-1.5 sm:text-xs ${
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
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:py-1.5 sm:text-xs ${
                                locationInputMode === 'list'
                                  ? 'bg-orange-600 text-amber-50 shadow-md'
                                  : 'bg-slate-400 text-amber-50 hover:bg-slate-500'
                              }`}
                            >
                              Words
                            </button>
                          </div>
                        </div>

                        <div className={LOCATION_PICKER_CONTAINER_CLASS}>
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
                      <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
                        {wizardMode === 'ai' ? (
                          <>
                            <h3 className={panelTitleClass}><span>💬</span><span>AI chat</span></h3>
                            <p className={panelNoteClass}>Friendly mode is on. I will keep this light while guiding us to a complete brief.</p>

                            <div ref={chatContainerRef} className="flex-1 min-h-[150px] sm:min-h-[180px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                              {chatMessages.map((message, idx) => (
                                <div key={`chat-${idx}`} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-2.5 py-2 text-sm leading-relaxed ${message.role === 'assistant' ? 'bg-white text-slate-800 border border-slate-200' : 'ml-auto bg-emerald-600 text-white'}`}>
                                  {renderChatMessageBody(message)}
                                </div>
                              ))}
                              {chatBusy && (
                                <p className="text-xs text-slate-500">Mimo is thinking...</p>
                              )}
                            </div>

                            {chatError && (
                              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{chatError}</p>
                            )}

                            <div className="shrink-0 rounded-lg border border-slate-200 bg-white/85 p-2">

                              {chatImageError && (
                                <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{chatImageError}</p>
                              )}

                              <div className={`flex gap-2 ${chatImageUrls.length > 0 ? 'flex-col sm:flex-row' : 'flex-col'}`}>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-end gap-2">
                                    <textarea
                                      value={chatInput}
                                      onChange={(e) => setChatInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          sendWizardAiTurn();
                                        }
                                      }}
                                      rows={2}
                                      placeholder="Reply to Mimo... (Enter to send, Shift+Enter for new line)"
                                      className="w-full min-h-[56px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:min-h-[64px] sm:text-sm"
                                    />
                                    <div className="flex flex-col gap-1.5">
                                      <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" title={chatImageUploadBusy ? 'Uploading' : 'Add images'}>
                                        {chatImageUploadBusy ? (
                                          <span className="h-4 w-4 animate-pulse rounded-full bg-emerald-200" />
                                        ) : (
                                          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
                                            <circle cx="8.5" cy="10.5" r="1.5" />
                                            <path d="M21 15l-5-5L5 21" />
                                          </svg>
                                        )}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          className="hidden"
                                          onChange={(e) => uploadChatImages(e.target.files)}
                                          disabled={chatImageUploadBusy || chatBusy || chatImageUrls.length >= AI_CHAT_MAX_IMAGES_PER_TURN}
                                        />
                                      </label>

                                      <button
                                        type="button"
                                        onClick={sendWizardAiTurn}
                                        disabled={chatBusy || chatInput.trim().length === 0}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                        title="Send"
                                      >
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M22 2L11 13" />
                                          <path d="M22 2l-7 20-4-9-9-4z" />
                                        </svg>
                                      </button>

                                      {aiChatCanContinue && !chatBusy && (
                                        <button
                                          type="button"
                                          onClick={handleAiContinue}
                                          className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 sm:text-xs"
                                        >
                                          {aiSummaryForConfirmation ? 'Use summary' : 'Continue'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {chatImageUrls.length > 0 && (
                                  <div className="sm:w-[188px] sm:shrink-0">
                                    <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:max-h-[96px] sm:grid-cols-2 sm:overflow-y-auto sm:overflow-x-hidden">
                                      {chatImageUrls.map((url) => (
                                        <div key={`chat-img-${url}`} className="relative w-20 shrink-0 rounded-md border border-slate-200 bg-white p-1.5 sm:w-auto">
                                          <div className="relative h-14 overflow-hidden rounded">
                                            <Image src={resolveMediaAssetUrl(url)} alt="Chat reference" fill className="object-cover" unoptimized />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => removeChatImageUrl(url)}
                                            className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow hover:bg-rose-700"
                                            title="Remove image"
                                          >
                                            <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                              <path d="M6 6l12 12M18 6L6 18" />
                                            </svg>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
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

                        {aiVisionReview && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-950">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">AI image analysis</p>
                            <p className="mt-1 text-xs text-emerald-800">
                              Processed {aiVisionReview.processedImageCount} image{aiVisionReview.processedImageCount === 1 ? '' : 's'}
                              {aiVisionReview.provider ? ` via ${aiVisionReview.provider}` : ''}
                              {aiVisionReview.model ? ` (${aiVisionReview.model})` : ''}.
                              {typeof aiVisionReview.confidence === 'number' ? ` Confidence ${Math.round(Math.max(0, Math.min(1, aiVisionReview.confidence)) * 100)}%.` : ''}
                            </p>

                            {aiVisionReview.summary && (
                              <p className="mt-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">{aiVisionReview.summary}</p>
                            )}

                            {aiVisionReview.conditionFindings.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold text-emerald-900">Condition findings</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-emerald-900">
                                  {aiVisionReview.conditionFindings.map((item, index) => (
                                    <li key={`vision-cond-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {aiVisionReview.safetyFlags.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold text-rose-800">Safety flags</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-rose-800">
                                  {aiVisionReview.safetyFlags.map((item, index) => (
                                    <li key={`vision-flag-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {activeStep?.kind !== 'followups' || wizardMode !== 'ai' ? (
              <div className="pointer-events-none absolute inset-x-3 bottom-2 flex items-center justify-between gap-2 sm:bottom-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={currentStep === 0}
                  className="pointer-events-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm"
                >
                  Back
                </button>

                {currentStep < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canGoNext}
                    className="pointer-events-auto rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitWizard}
                    className="pointer-events-auto rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition sm:px-3 sm:py-2 sm:text-sm"
                  >
                    Continue to Invite Professionals
                  </button>
                )}
              </div>
            ) : null}
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
