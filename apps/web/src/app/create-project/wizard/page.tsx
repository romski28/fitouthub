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
// import { RequirementChecklist } from '@/components/requirement-checklist'; // DISABLED July 15
import { VoiceInputButton } from '@/components/voice-input-button';
import { ListenButton } from '@/components/listen-button';
import { WorkDatePicker } from '@/components/work-date-picker';
import { toDateKey } from '@/lib/hk-holidays';
import { extractAiOptions } from '@/lib/ai-options';
// import { MimoSpinner } from '@/components/mimo-spinner'; // REMOVED (upload overlay disabled July 15)
import { useTextToSpeech } from '@/hooks/use-text-to-speech';

type WizardStep =
  | { kind: 'followups' }
  | { kind: 'projectDetails' }
  | { kind: 'images' };
  // REMOVED July 14 Phase 2: basics, location, scopeDates merged into projectDetails; review removed earlier


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
  safetyNotes?: string[];
  riskNotes?: string[];
  riskLevel?: string | null;
}

interface CreateProjectDraft {
  initialData?: Partial<ProjectFormData>;
  selectedProfessionals?: Professional[];
  aiIntakeId?: string;
  followUpQuestions?: string[];
  safetyNotes?: string[];
  riskNotes?: string[];
  riskLevel?: string | null;
}

interface WizardChatMessage {
  role: 'assistant' | 'user';
  text: string;
  options?: { label: string; value: string }[];
}

// REMOVED (review step disabled July 14)
// interface AiVisionReviewSnapshot {
//   summary: string;
//   conditionFindings: string[];
//   safetyFlags: string[];
//   followUpQuestions: string[];
//   confidence: number | null;
//   processedImageCount: number;
//   provider: string | null;
//   model: string | null;
// }

type ServiceOfferType = 'survey' | 'design';

interface ServiceOfferCopy {
  title: string;
  hint: string;
  modalIntro: string;
  details: string[];
  price?: string;
  selectedMessage: string;
}

const AI_SUMMARY_CONFIDENCE_THRESHOLD = 0.74;
const AI_CHAT_MAX_IMAGES_PER_TURN = 5;
const SERVICE_OFFER_MARKER_PREFIX = '[[service-offer:';

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
  return /(which\s+(district|area|region|location)|what\s+(district|area|region|location)|where\s+(is|are|in)\s+(the|your|this)|what\s+is\s+the\s+address|postal\s*code|zip\s*code|neighbourhood|hong\s*kong\s+island|kowloon|new\s*territories)/i.test(normalized);
};

const isBudgetOrTimelineFollowUpQuestion = (question: string): boolean => {
  const normalized = question.toLowerCase();
  return /(what\s+is\s+(your|the)\s+budget|how\s+much\s+(do|is|are|can|will).*(spend|budget|cost|pay)|when\s+do\s+you\s+need\s+(it|this)|completion\s+date|deadline|finish\s+by|target\s+date|due\s+date)/i.test(normalized);
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
  allowSurveyPrompt?: boolean;
  hasAskedSizeOrCondition?: boolean;
  hasSurveyService?: boolean;
}): string | null => {
  if (!context.title.trim()) {
    return 'What short project title should we use for this work?';
  }
  if (context.trades.length === 0) {
    return 'Which parts of the room are included in this scope so I can lock the right trade match?';
  }
  if (context.hasSurveyService === true) {
    if (context.isEmergency === null) {
      return 'Is this urgent or can it be planned as a normal timeline project?';
    }
    return null;
  }
  if (context.hasAskedSizeOrCondition) {
    if (context.isEmergency === null) {
      return 'Is this urgent or can it be planned as a normal timeline project?';
    }
    return null;
  }
  if (context.summary.trim().length < 90 && context.allowSurveyPrompt !== false) {
    return 'Roughly how big is the area, and are there any access or site-condition issues we should keep in mind?';
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

// REMOVED — header simplified, no more motivation text
// const MOTIVATION = [
//   'Nice! Let\'s build this in under a minute.',
//   'Looking great. This is coming together.',
//   'Final stretch, let\'s launch this.',
// ];

const panelTitleClass = 'flex items-start gap-2 text-lg font-semibold text-slate-900 sm:text-xl';
const panelNoteClass = 'text-xs leading-relaxed text-slate-700 sm:text-sm';
const panelContentClass = 'flex h-full min-h-0 flex-col gap-3 sm:gap-4';
const LOCATION_PICKER_CONTAINER_CLASS = 'min-h-[300px] flex-1 overflow-hidden';

const shouldPromptSurveyService = (text: string): boolean =>
  /(size|dimensions?|measurements?|sqm|sq\.?\s?m|sqft|square\s+(feet|foot|metres|meters)|floor\s+area|site\s+measure|how\s+big|what\s+size)/i.test(text);

const isConditionFollowUpQuestion = (text: string): boolean =>
  /(site\s*condition|current\s*condition|condition\s*of\s*(the\s*)?(site|space|bathroom|room)|water\s*damage|old\s*tiles|fixtures\s*to\s*replace|defects?)/i.test(text);

const shouldPromptDesignService = (text: string): boolean =>
  /(design|look\s+and\s+feel|style|aesthetic|interior\s+design|theme|mood\s*board|layout\s+design|concept\s+design|finish\s+selection)/i.test(text);

const appendServiceOfferHint = (text: string, offerType: ServiceOfferType | null): string => {
  if (!offerType || !text.trim()) return text;
  return `${text}\n\n${SERVICE_OFFER_COPY[offerType].hint}\n${SERVICE_OFFER_MARKER_PREFIX}${offerType}]]`;
};

const extractServiceOfferFromMessage = (text: string): { body: string; offerType: ServiceOfferType | null } => {
  const match = text.match(/\n?\[\[service-offer:(survey|design)\]\]$/);
  if (!match) {
    return { body: text, offerType: null };
  }

  return {
    body: text.replace(/\n?\[\[service-offer:(survey|design)\]\]$/, ''),
    offerType: match[1] as ServiceOfferType,
  };
};

const SERVICE_OFFER_COPY: Record<ServiceOfferType, ServiceOfferCopy> = {
  survey: {
    title: 'MIMO Surveying+',
    hint: "If you're unsure on the size, MIMO can provide a Surveying+ service.",
    modalIntro: 'MIMO can handle the site survey before the brief is locked, so you do not need to guess the room size or site conditions.',
    details: [
      'Full digital measured 360 photo survey',
      'Assessment of structure',
      'Utilities and services review',
      'Openings and access review',
      'Condition and defects assessment',
      'Environmental factors review',
    ],
    price: 'From HK$500 per room',
    selectedMessage: 'MIMO survey service selected.',
  },
  design: {
    title: 'MIMO Interior Design',
    hint: 'If you want help shaping the look and feel, MIMO can provide interior design support.',
    modalIntro: 'MIMO can take on the design layer before quoting so the brief has a clearer direction and professionals are pricing against the same intent.',
    details: [
      'Layout and space-planning direction',
      'Look and feel development',
      'Style and finish guidance',
      'Concept alignment before professionals quote',
    ],
    selectedMessage: 'MIMO interior design service selected.',
  },
};

export default function CreateProjectWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, userLocation, accessToken, preferredLanguage, user } = useAuth();

  const [hydrated, setHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
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
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatFileError, setChatFileError] = useState<string | null>(null);
  const [aiChatCanContinue, setAiChatCanContinue] = useState(false);
  const [listenMode, setListenMode] = useState(false);
  const ttsLang = preferredLanguage === 'zh-CN' ? 'zh-CN' : preferredLanguage === 'zh-HK' ? 'zh-HK' : 'en-HK';
  const { isSupported: ttsSupported, speak: ttsSpeak, stop: ttsStop } = useTextToSpeech({ lang: ttsLang });

  const prevMsgCountRef = useRef(chatMessages.length);
  useEffect(() => {
    if (!listenMode) return;
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = chatMessages.length;
    if (chatMessages.length > prev) {
      const last = chatMessages[chatMessages.length - 1];
      if (last.role === 'assistant') {
        ttsSpeak(last.text);
      }
    }
  }, [chatMessages, listenMode, ttsSpeak]);

  // Auto-clear file error after 5 seconds
  useEffect(() => {
    if (!chatFileError) return;
    const timer = setTimeout(() => setChatFileError(null), 5000);
    return () => clearTimeout(timer);
  }, [chatFileError]);

  // REMOVED (review step disabled July 14): aiVisionReview, reviewTab
  // const [aiVisionReview, setAiVisionReview] = useState<AiVisionReviewSnapshot | null>(null);
  // const [reviewTab, setReviewTab] = useState<'summary' | 'vision'>('summary');
  const [requiresSurveyService, setRequiresSurveyService] = useState<boolean | null>(null);
  const [requiresDesignService, setRequiresDesignService] = useState<boolean | null>(null);
  const [surveyOfferPrompted, setSurveyOfferPrompted] = useState(false);
  const [designOfferPrompted, setDesignOfferPrompted] = useState(false);
  const [summaryConfirmationShown, setSummaryConfirmationShown] = useState(false);
  const [pendingServiceOffer, setPendingServiceOffer] = useState<ServiceOfferType | null>(null);
  const [expandedServiceOffer, setExpandedServiceOffer] = useState<ServiceOfferType | null>(null);
  const [aiSafetyNotes, setAiSafetyNotes] = useState<string[]>([]);
  const [aiRiskNotes, setAiRiskNotes] = useState<string[]>([]);
  const [aiRiskLevel, setAiRiskLevel] = useState<string | null>(null);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [currentAiIntakeId, setCurrentAiIntakeId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [endDate, setEndDate] = useState('');
  const [siteInspectionAvailableOn, setSiteInspectionAvailableOn] = useState('');
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [projectFiles, setProjectFiles] = useState<File[]>([]);
  // const [wizardCoveredTopics, setWizardCoveredTopics] = useState<string[]>([]); // DISABLED July 15 (RequirementChecklist hidden)
  const [showNoFilesWarning, setShowNoFilesWarning] = useState(false);
  const [projectFileError, setProjectFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationInputMode, setLocationInputMode] = useState<LocationInputMode>(() => {
    if (typeof window === 'undefined') return 'map';
    try {
      const storedMode = window.localStorage.getItem('fh-map-or-list-preference');
      return storedMode === 'list' ? 'list' : 'map';
    } catch {
      return 'map';
    }
  });
  const [skipPrompt, setSkipPrompt] = useState<'site' | 'end' | null>(null);

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
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    // Defensive reset when route query context is re-evaluated.
    // This prevents preserved client state from reopening mid-wizard.
    hasInitializedFromSeedRef.current = false;
    hasManualStepNavigationRef.current = false;
    setAiChatCanContinue(false);
    setCurrentStep(0);
    // setAiVisionReview(null); // REMOVED (review step disabled July 14)
    setRequiresSurveyService(null);
    setRequiresDesignService(null);
    setSurveyOfferPrompted(false);
    setDesignOfferPrompted(false);
    setSummaryConfirmationShown(false);
    setPendingServiceOffer(null);
    setExpandedServiceOffer(null);
    setAiSafetyNotes([]);
    setAiRiskNotes([]);
    setAiRiskLevel(null);
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
    const nextSurveyToggle = typeof seedDraft?.initialData?.requiresSurveyService === 'boolean'
      ? seedDraft.initialData.requiresSurveyService
      : null;
    const nextDesignToggle = typeof seedDraft?.initialData?.requiresDesignService === 'boolean'
      ? seedDraft.initialData.requiresDesignService
      : null;
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
    setRequiresSurveyService(nextSurveyToggle);
    setRequiresDesignService(nextDesignToggle);
    setSurveyOfferPrompted(nextSurveyToggle !== null);
    setDesignOfferPrompted(nextDesignToggle !== null);
    setFollowUpQuestions(nextQuestions);
    setAiSafetyNotes(Array.isArray(seedDescription?.safetyNotes) ? seedDescription.safetyNotes : []);
    setAiRiskNotes(Array.isArray(seedDescription?.riskNotes) ? seedDescription.riskNotes : []);
    setAiRiskLevel(typeof seedDescription?.riskLevel === 'string' ? seedDescription.riskLevel : null);
    setChatError(null);
    setChatFileError(null);
    setAiChatCanContinue(false);
    setCurrentAiIntakeId(seedDraft?.aiIntakeId || null);
    setExpandedServiceOffer(null);

    const openingSummary = nextSummary || nextTitle;
    const starterText = openingSummary
      ? `Great start. I can help shape this into a clear project brief without making it feel like homework. ${openingSummary}`
      : 'Nice, let\'s make this easy. I\'ll help you build a clear brief step by step so pros can quote with fewer surprises.';
    const firstQuestionRaw = sanitizeFollowUpQuestions(normalizeQuestions(nextQuestions))[0] || null;
    const seedTrades = seedDraft?.initialData?.tradesRequired || seedDescription?.tradesRequired || [];
    const isRepairOrEmergency = nextEmergency === true || seedTrades.length <= 1;
    const firstQuestionOfferType = firstQuestionRaw && !isRepairOrEmergency
      ? (nextSurveyToggle === null && shouldPromptSurveyService(firstQuestionRaw)
          ? 'survey'
          : nextDesignToggle === null && shouldPromptDesignService(firstQuestionRaw)
            ? 'design'
            : null)
      : null;
    const firstQuestion = firstQuestionRaw ? appendServiceOfferHint(firstQuestionRaw, firstQuestionOfferType) : null;

    if (firstQuestionOfferType) {
      setPendingServiceOffer(firstQuestionOfferType);
      if (firstQuestionOfferType === 'survey') setSurveyOfferPrompted(true);
      if (firstQuestionOfferType === 'design') setDesignOfferPrompted(true);
    }

    const seedMessages: WizardChatMessage[] = [{ role: 'assistant', text: starterText }];
    if (firstQuestion) seedMessages.push({ role: 'assistant', text: firstQuestion });
    setChatMessages(seedMessages);

    setEndDate(nextEndDate);
    setSiteInspectionAvailableOn(nextSiteInspection);
    setExistingImageUrls(seededPhotos);
    setAnswers({});
    // setWizardCoveredTopics([]); // DISABLED July 15
    setCurrentStep(0);
    hasInitializedFromSeedRef.current = true;
  }, [seedLoaded, seedDraft, seedDescription, userLocation]);

  useEffect(() => {
    if (!hydrated) return;
    if (aiSessionId) return;
    // Reuse the home page AI session ID so the thread chain is preserved
    const existing = sessionStorage.getItem('aiSandboxSessionId');
    if (existing) {
      setAiSessionId(existing);
    } else {
      setAiSessionId(createAiSessionId());
    }
  }, [hydrated, aiSessionId]);

  useEffect(() => {
    if (isEmergency === true) {
      setPendingServiceOffer(null);
      setExpandedServiceOffer(null);
    }
  }, [isEmergency]);

  const followUpStepQuestions = useMemo(() => followUpQuestions.slice(0, 3), [followUpQuestions]);

  const renderChatMessageBody = (message: WizardChatMessage) => {
    const { body, offerType } = extractServiceOfferFromMessage(message.text);

    if (!offerType) {
      return body;
    }

    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap">{body}</p>
        <button
          type="button"
          onClick={() => setExpandedServiceOffer(offerType)}
          className="rounded-lg border border-[#E95E51] bg-[#F26F63] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E95E51]"
        >
          Find out more
        </button>
      </div>
    );
  };

  const hasImagesFromChat = chatAttachedFiles.length > 0 || projectFiles.length > 0;

  const steps = useMemo<WizardStep[]>(
    () => {
      // If AI is done and user shared images in chat, skip the images step entirely
      if (summaryConfirmationShown && hasImagesFromChat) {
        return [
          { kind: 'followups' as const },
          { kind: 'projectDetails' as const },
        ];
      }
      // No images shared — insert images step before projectDetails so they get a chance
      if (summaryConfirmationShown && !hasImagesFromChat) {
        return [
          { kind: 'followups' as const },
          { kind: 'images' as const },
          { kind: 'projectDetails' as const },
        ];
      }
      // AI still running — default layout (all 3, images last)
      return [
        { kind: 'followups' as const },
        { kind: 'projectDetails' as const },
        { kind: 'images' as const },
      ];
    },
    [summaryConfirmationShown, hasImagesFromChat],
  );

  // Safety: clamp currentStep if the steps array shrank (e.g. images shared mid-chat)
  useEffect(() => {
    if (currentStep >= steps.length) {
      setCurrentStep(steps.length - 1);
    }
  }, [steps.length, currentStep]);

  const activeStep = steps[currentStep];
  // const currentMotivation = MOTIVATION[Math.min(currentStep, MOTIVATION.length - 1)] || MOTIVATION[MOTIVATION.length - 1]; // REMOVED — header simplified
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
    if (activeStep.kind === 'projectDetails') return title.trim().length > 0 && Boolean(location.primary || location.secondary || location.tertiary);
    if (activeStep.kind === 'followups') return true;
    return true;
  }, [activeStep, title, location.primary, location.secondary, location.tertiary]);

  const progress = steps.length > 1 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;

  useEffect(() => {
    if (activeStep?.kind !== 'followups') return;
    const node = chatContainerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activeStep, chatMessages, chatBusy]);

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

  const handleServiceOfferChoice = (accepted: boolean) => {
    const offerType = expandedServiceOffer || pendingServiceOffer;
    if (!offerType) return;

    if (offerType === 'survey') {
      setRequiresSurveyService(accepted);
    }
    if (offerType === 'design') {
      setRequiresDesignService(accepted);
    }

    setPendingServiceOffer(null);
    setExpandedServiceOffer(null);

    if (accepted) {
      // Add a confirmation message to chat — NOT sent to AI
      const confirmMsg = offerType === 'survey'
        ? 'OK, thanks — we\'ll reach out to arrange the MIMO Surveying+ shortly.'
        : 'OK, thanks — we\'ll reach out to arrange the MIMO Interior Design service shortly.';
      setChatMessages((prev) => [...prev, { role: 'user' as const, text: confirmMsg }]);

      // Prompt AI to continue scoping — tells it the survey/design will handle that part
      const aiPrompt = offerType === 'survey'
        ? 'The room size and site conditions will be confirmed by the MIMO survey team. Based on everything we\'ve discussed so far, what should we figure out next to keep this project moving forward?'
        : 'The design details will be worked out by the MIMO design team. Based on everything we\'ve discussed so far, what should we figure out next to keep this project moving forward?';
      void sendWizardAiTurn(aiPrompt);
    }
    // Decline: just close the modal — user continues typing naturally
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

  const removeProjectFile = (index: number) => {
    setProjectFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addProjectFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const pending = Array.from(files);

    const oversized = pending.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setProjectFileError(`File${oversized.length === 1 ? '' : 's'} too large: ${oversized.map(f => f.name).join(', ')}. Max 5 MB per file.`);
      return;
    }

    setProjectFileError(null);
    setProjectFiles((prev) => [...prev, ...pending]);
  };

  const removeChatFile = (index: number) => {
    setChatAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addChatFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    const pending = Array.from(files);

    const oversized = pending.filter((f) => f.size > MAX_FILE_SIZE);
    const valid = pending.filter((f) => f.size <= MAX_FILE_SIZE);

    if (valid.length === 0) {
      setChatFileError(`File${oversized.length === 1 ? '' : 's'} too large: ${oversized.map(f => f.name).join(', ')}. Max 5 MB per file.`);
      return;
    }

    const remainingSlots = Math.max(0, AI_CHAT_MAX_IMAGES_PER_TURN - chatAttachedFiles.length);
    if (remainingSlots <= 0) {
      setChatFileError(`You can attach up to ${AI_CHAT_MAX_IMAGES_PER_TURN} files per message.`);
      return;
    }

    const filesToAdd = valid.slice(0, remainingSlots);
    const skipped = valid.length - filesToAdd.length;

    let msg = '';
    if (oversized.length > 0) {
      msg = `${oversized.length} file${oversized.length === 1 ? '' : 's'} skipped (over 5 MB). `;
    }
    if (skipped > 0) {
      msg += `Only ${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} left — ${skipped} file${skipped === 1 ? '' : 's'} skipped.`;
    }
    setChatFileError(msg || null);

    setChatAttachedFiles((prev) => [...prev, ...filesToAdd].slice(0, AI_CHAT_MAX_IMAGES_PER_TURN));
  };

  const sendWizardAiTurn = async (
    promptOverride?: string,
  ) => {
    const prompt = (promptOverride ?? chatInput).trim();

    if (!prompt || chatBusy) return;

    console.log('🔵 [wizard-turn] START', { promptOverride: !!promptOverride, promptLen: prompt.length });

    setPendingServiceOffer(null);
    setExpandedServiceOffer(null);
    const effectiveSessionId = aiSessionId || createAiSessionId();

    if (!aiSessionId) {
      setAiSessionId(effectiveSessionId);
    }

    if (!promptOverride) {
      setChatInput('');
    }
    setChatBusy(true);
    setChatError(null);
    setAiChatCanContinue(false);
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
          intakeId: currentAiIntakeId || undefined,
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

      console.log('🟢 [wizard-turn] RESPONSE', { hasParsed: !!parsed, parsedKeys: parsed ? Object.keys(parsed).slice(0, 10) : [], hasOptions: !!(parsed?.options), textLen: nextConversationalText.length });
      /* const imageInsights =
        parsed?.project && typeof parsed.project === 'object' && !Array.isArray(parsed.project)
          ? ((parsed.project as Record<string, unknown>).imageInsights as Record<string, unknown> | undefined)
          : undefined;
      const imageInsightSummary = typeof imageInsights?.summary === 'string' ? imageInsights.summary.trim() : ''; */
      // REMOVED (review step disabled July 14): imageConditionFindings, imageSafetyFlags, imageFollowUpQuestions
      /* const imageConditionFindings = Array.isArray(imageInsights?.conditionFindings)
        ? imageInsights.conditionFindings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const imageSafetyFlags = Array.isArray(imageInsights?.safetyFlags)
        ? imageInsights.safetyFlags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const imageFollowUpQuestions = Array.isArray(imageInsights?.followUpQuestions)
        ? imageInsights.followUpQuestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : []; */
      /* const processedImageCount =
        payload?.vision?.usage && typeof payload.vision.usage === 'object' && typeof payload.vision.usage.processedImageCount === 'number'
          ? payload.vision.usage.processedImageCount
          : turnImageUrls.length; */

      // Extract safety & risk notes from AI response
      const safetyAssessment = parsed?.safetyAssessment && typeof parsed.safetyAssessment === 'object'
        ? (parsed.safetyAssessment as Record<string, unknown>)
        : null;
      const parsedRiskLevel = typeof safetyAssessment?.riskLevel === 'string' ? safetyAssessment.riskLevel.toLowerCase() : null;
      const parsedConcerns = Array.isArray(safetyAssessment?.concerns) ? safetyAssessment.concerns.filter((c): c is string => typeof c === 'string' && c.trim().length > 0) : [];
      const parsedMitigations = Array.isArray(safetyAssessment?.temporaryMitigations) ? safetyAssessment.temporaryMitigations.filter((m): m is string => typeof m === 'string' && m.trim().length > 0) : [];
      const parsedRisks = Array.isArray(parsed?.risks) ? parsed.risks.filter((r): r is string => typeof r === 'string' && r.trim().length > 0) : [];
      const parsedDisclaimer = typeof safetyAssessment?.disclaimer === 'string' && safetyAssessment.disclaimer.trim().length > 0 ? safetyAssessment.disclaimer.trim() : null;

      const safetyNotes: string[] = [
        ...parsedConcerns,
        ...parsedMitigations,
        ...(parsedDisclaimer ? [parsedDisclaimer] : []),
      ];
      // Surface safety data whenever there are notes, risks, or a non-trivial risk level
      const hasSafetyData = safetyNotes.length > 0 || parsedRisks.length > 0 || (parsedRiskLevel && parsedRiskLevel !== 'none' && parsedRiskLevel !== 'low');
      if (hasSafetyData) {
        if (safetyNotes.length > 0) setAiSafetyNotes((prev) => Array.from(new Set([...prev, ...safetyNotes])));
        if (parsedRisks.length > 0) setAiRiskNotes((prev) => Array.from(new Set([...prev, ...parsedRisks])));
        if (parsedRiskLevel) {
          setAiRiskLevel((prev) => {
            const order: string[] = ['low', 'medium', 'high', 'critical'];
            const prevIdx = order.indexOf(prev === null ? '' : prev);
            const newIdx = order.indexOf(parsedRiskLevel!);
            return newIdx > prevIdx ? parsedRiskLevel : prev;
          });
        }
        console.log('[wizard][safety] extracted safetyNotes:', safetyNotes, 'riskNotes:', parsedRisks, 'riskLevel:', parsedRiskLevel);
      }
      // REMOVED (review step disabled July 14): imageConfidence, imageProvider, imageModel
      /* const imageConfidence = typeof imageInsights?.confidence === 'number' ? imageInsights.confidence : null;
      const imageProvider = typeof imageInsights?.provider === 'string' ? imageInsights.provider : null;
      const imageModel = typeof imageInsights?.model === 'string' ? imageInsights.model : null; */
      // Extract answer options from AI response (shared with search-flow)
      const followUps: string[] = Array.isArray(parsed?.nextQuestions) ? parsed.nextQuestions as string[]
        : Array.isArray(parsed?.followUpQuestions) ? parsed.followUpQuestions as string[]
        : [];
      const fallbackText = followUps[0] || nextConversationalText;
      const answerOptions = extractAiOptions(
        parsed as Record<string, unknown> | null,
        payload?.options,
        fallbackText,
      ) ?? undefined;
      console.log('[wizard][options] generated:', answerOptions?.length, 'source:', fallbackText.slice(0, 80));

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: nextConversationalText, options: answerOptions?.length ? answerOptions : undefined },
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

      // const nextCoveredTopics = Array.isArray(parsed?.coveredTopics)
      //   ? parsed.coveredTopics.filter((item): item is string => typeof item === 'string')
      //   : [];
      // if (nextCoveredTopics.length > 0) setWizardCoveredTopics(nextCoveredTopics); // DISABLED July 15

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

      const assistantQuestionBodies = chatMessages
        .filter((message) => message.role === 'assistant')
        .map((message) => extractServiceOfferFromMessage(message.text).body);
      const hasAskedSizeOrCondition = assistantQuestionBodies.some(
        (question) => shouldPromptSurveyService(question) || isConditionFollowUpQuestion(question),
      );

      const filteredParsedQuestions = dedupedParsedQuestions.filter((question) => {
        const isSizeOrConditionQuestion = shouldPromptSurveyService(question) || isConditionFollowUpQuestion(question);
        if (!isSizeOrConditionQuestion) return true;
        if (requiresSurveyService === true) return false;
        if (hasAskedSizeOrCondition) return false;
        return true;
      });

      const askedAssistantQuestionKeys = new Set(
        chatMessages
          .filter((message) => message.role === 'assistant')
          .map((message) => normalizeQuestionKey(message.text))
          .filter((key) => key.length > 0),
      );
          const nextUnaskedQuestion = filteredParsedQuestions.find((question) => !askedAssistantQuestionKeys.has(normalizeQuestionKey(question))) || null;
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
      if (filteredParsedQuestions.length > 0) {
        setFollowUpQuestions(filteredParsedQuestions);
      }

      const nextIntakeId = typeof payload?.intakeId === 'string' && payload.intakeId.trim().length > 0
        ? payload.intakeId.trim()
        : null;
      if (nextIntakeId) {
        setCurrentAiIntakeId(nextIntakeId);
      }

      let nextPendingOffer: ServiceOfferType | null = null;

      if (isEmergency === true || mergedTrades.length <= 1) {
        // Don't offer survey/design for emergencies or single-trade repairs
        setPendingServiceOffer(null);
      } else {
        const candidateOfferText = [
          nextConversationalText,
          nextUnaskedQuestion || '',
          ...filteredParsedQuestions,
        ].join(' ');

        if (requiresSurveyService === null && !surveyOfferPrompted && shouldPromptSurveyService(candidateOfferText)) {
          setPendingServiceOffer('survey');
          setSurveyOfferPrompted(true);
          nextPendingOffer = 'survey';
        } else if (requiresDesignService === null && !designOfferPrompted && shouldPromptDesignService(candidateOfferText)) {
          setPendingServiceOffer('design');
          setDesignOfferPrompted(true);
          nextPendingOffer = 'design';
        } else {
          setPendingServiceOffer(null);
        }
      }

      // Inject the first next-question as the next chat prompt so it appears inside the conversation
      if (shouldOfferSummaryConfirmation) {
        let nextQuestion = nextUnaskedQuestion
          ? appendServiceOfferHint(nextUnaskedQuestion, nextPendingOffer)
          : null;

        // If no unasked question from AI, try a fallback
        if (!nextQuestion) {
          const fallback = getNextBestMissingBriefQuestion({
            title: nextTitle || title,
            summary: nextSummary || summary,
            trades: mergedTrades,
            isEmergency,
            allowSurveyPrompt: requiresSurveyService !== true,
            hasAskedSizeOrCondition,
            hasSurveyService: requiresSurveyService === true,
          });
          if (fallback) {
            nextQuestion = appendServiceOfferHint(fallback, nextPendingOffer);
          }
        }

        setAiChatCanContinue(true);

        if (nextQuestion) {
          const prefix = summaryConfirmationShown
            ? 'Another question, if you have the time.'
            : 'Thanks, we have enough information to proceed. Click Next to move on or continue answering questions if you have time.';
          if (!summaryConfirmationShown) setSummaryConfirmationShown(true);
          setChatMessages((prev) => [...prev, { role: 'assistant', text: `${prefix}\n\n${nextQuestion}` }]);
        } else {
          // No more questions — all done. Auto-advance after 5s
          if (!summaryConfirmationShown) setSummaryConfirmationShown(true);
          setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Thanks, we are done here. Let\'s move on.' }]);
          setTimeout(() => {
            if (currentStep < steps.length - 1) {
              goNext();
            } else {
              submitWizard();
            }
          }, 5000);
        }
      } else if (nextUnaskedQuestion) {
        setAiChatCanContinue(false);
        setChatMessages((prev) => [...prev, { role: 'assistant', text: appendServiceOfferHint(nextUnaskedQuestion, nextPendingOffer) }]);
      } else {
        const fallbackQuestion = getNextBestMissingBriefQuestion({
          title: nextTitle || title,
          summary: nextSummary || summary,
          trades: mergedTrades,
          isEmergency,
          allowSurveyPrompt: requiresSurveyService !== true,
          hasAskedSizeOrCondition,
          hasSurveyService: requiresSurveyService === true,
        });

        if (fallbackQuestion) {
          if (isEmergency !== true && !nextPendingOffer) {
            if (requiresSurveyService === null && !surveyOfferPrompted && shouldPromptSurveyService(fallbackQuestion)) {
              nextPendingOffer = 'survey';
              setPendingServiceOffer('survey');
              setSurveyOfferPrompted(true);
            } else if (requiresDesignService === null && !designOfferPrompted && shouldPromptDesignService(fallbackQuestion)) {
              nextPendingOffer = 'design';
              setPendingServiceOffer('design');
              setDesignOfferPrompted(true);
            }
          }

          setAiChatCanContinue(false);
          setChatMessages((prev) => [...prev, { role: 'assistant', text: appendServiceOfferHint(fallbackQuestion, nextPendingOffer) }]);
        } else {
          const completionText = 'OK, we have enough project information to proceed. Send with no text to move on.';
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

      // Files persist until wizard submission — no premature clearing
    } catch (error) {
      setChatError((error as Error).message || 'Unable to continue AI chat right now.');
    } finally {
      setChatBusy(false);
    }
  };

  const buildWizardPayload = async () => {
    const allPendingFiles = [...chatAttachedFiles, ...projectFiles];
    let finalPhotoUrls = [...existingImageUrls];
    if (allPendingFiles.length > 0) {
      setProjectFileError(null);
      try {
        const formData = new FormData();
        allPendingFiles.forEach((file) => formData.append('files', file));
        const response = await fetch(`${API_BASE_URL}/uploads`, {
          method: 'POST',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || `Upload failed (${response.status})`);
        }
        const uploadedUrls = getUploadResponseKeys(payload);
        if (uploadedUrls.length > 0) {
          finalPhotoUrls = Array.from(new Set([...existingImageUrls, ...uploadedUrls]));
        }
      } catch (error) {
        setProjectFileError((error as Error).message || 'Failed to upload files');
        return null;
      }
    }

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
      typeof requiresSurveyService === 'boolean'
        ? `Survey service requested: ${requiresSurveyService ? 'Yes' : 'No'}`
        : '',
      typeof requiresDesignService === 'boolean'
        ? `Design service requested: ${requiresDesignService ? 'Yes' : 'No'}`
        : '',
    ].filter(Boolean).join('\n\n');

    const resolvedRegion = [location.secondary, location.primary]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join(', ');

    const resolvedClientName =
      user?.firstName && user?.surname
        ? `${user.firstName} ${user.surname}`
        : seedDraft?.initialData?.clientName || '';

    return {
      projectName: title.trim(),
      clientName: resolvedClientName,
      region: resolvedRegion || seedDraft?.initialData?.region || '',
      notes: mergedSummary,
      isEmergency: Boolean(isEmergency),
      projectScale: normalizeProjectScale(seedDraft?.initialData?.projectScale) ||
        normalizeProjectScale(seedDescription?.projectScale) || undefined,
      tradesRequired: resolvedTradesRequired,
      endDate: endDate || undefined,
      siteInspectionAvailableOn: siteInspectionAvailableOn || undefined,
      photoUrls: finalPhotoUrls,
      requiresSurveyService: typeof requiresSurveyService === 'boolean' ? requiresSurveyService : false,
      requiresDesignService: typeof requiresDesignService === 'boolean' ? requiresDesignService : false,
      aiIntakeId: currentAiIntakeId || seedDraft?.aiIntakeId,
    };
  };

  const submitWizard = async () => {
    const data = await buildWizardPayload();
    if (!data) return;

    const nextDraft: CreateProjectDraft = {
      initialData: { ...(seedDraft?.initialData || {}), ...data },
      selectedProfessionals: seedDraft?.selectedProfessionals || [],
      aiIntakeId: data.aiIntakeId,
      followUpQuestions: followUpStepQuestions,
      safetyNotes: aiSafetyNotes,
      riskNotes: aiRiskNotes,
      riskLevel: aiRiskLevel,
    };

    writeCreateProjectDraftSafely(nextDraft);
    setCreateProjectDraftHandoff(nextDraft);

    const nextDescription: ProjectDescriptionData = {
      title: data.projectName,
      description: data.notes || '',
      projectScale: (normalizeProjectScale(data.projectScale) || undefined) as ProjectDescriptionData['projectScale'],
      isEmergency: data.isEmergency,
      profession: data.tradesRequired?.[0],
      location,
      tradesRequired: data.tradesRequired || [],
      followUpQuestions: followUpStepQuestions,
      safetyNotes: aiSafetyNotes,
      riskNotes: aiRiskNotes,
      riskLevel: aiRiskLevel,
    };

    setProjectDescriptionHandoff(nextDescription);
    try { sessionStorage.setItem('projectDescription', JSON.stringify(nextDescription)); } catch { /* best effort */ }

    const params = new URLSearchParams();
    if (data.tradesRequired[0]) params.set('trade', data.tradesRequired[0]);
    if (data.tradesRequired.length > 0) params.set('trades', data.tradesRequired.join(','));
    if (location.tertiary) params.set('location', location.tertiary);
    else if (location.secondary) params.set('location', location.secondary);
    else if (location.primary) params.set('location', location.primary);
    else params.set('askRegion', '1');
    if (data.projectName) params.set('aiTitle', data.projectName.slice(0, 180));
    if (data.notes) params.set('aiScope', data.notes.slice(0, 1800));
    if (data.projectScale) params.set('aiScale', data.projectScale);
    params.set('aiEmergency', data.isEmergency ? '1' : '0');
    params.set('source', 'ai-wizard');

    router.push(`/create-project?${params.toString()}`);
  };

  const submitAndOpenTender = async () => {
    const data = await buildWizardPayload();
    if (!data) return;
    setIsSubmitting(true);

    const nextDraft: CreateProjectDraft = {
      initialData: { ...(seedDraft?.initialData || {}), ...data },
      selectedProfessionals: seedDraft?.selectedProfessionals || [],
      aiIntakeId: data.aiIntakeId,
      followUpQuestions: followUpStepQuestions,
      safetyNotes: aiSafetyNotes,
      riskNotes: aiRiskNotes,
      riskLevel: aiRiskLevel,
    };

    writeCreateProjectDraftSafely(nextDraft);
    setCreateProjectDraftHandoff(nextDraft);
    // Also persist photo URLs so the submitting page can read them
    try { sessionStorage.setItem('createProjectDraft', JSON.stringify(nextDraft)); } catch { /* best effort */ }

    router.push('/create-project/submitting');
  };

  const submitAndChoosePros = async () => {
    // Upload any pending files first so they aren't dropped
    const data = await buildWizardPayload();
    if (!data) return;

    const resolvedTrades = normalizeUniqueStringList(
      data.tradesRequired || firstNonEmptyStringArray(seedDraft?.initialData?.tradesRequired, seedDescription?.tradesRequired),
    );
    const resolvedRegion = data.region || [location.secondary, location.primary]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join(', ');

    const draft: CreateProjectDraft = {
      initialData: {
        ...(seedDraft?.initialData || {}),
        projectName: data.projectName || title.trim(),
        notes: data.notes || summary.trim(),
        location,
        region: resolvedRegion || seedDraft?.initialData?.region || '',
        isEmergency: Boolean(isEmergency),
        tradesRequired: resolvedTrades,
        endDate: endDate || undefined,
        siteInspectionAvailableOn: siteInspectionAvailableOn || undefined,
        photoUrls: data.photoUrls,
        requiresSurveyService: typeof requiresSurveyService === 'boolean' ? requiresSurveyService : undefined,
        requiresDesignService: typeof requiresDesignService === 'boolean' ? requiresDesignService : undefined,
      },
      aiIntakeId: data.aiIntakeId,
      followUpQuestions: followUpStepQuestions,
      safetyNotes: aiSafetyNotes,
      riskNotes: aiRiskNotes,
      riskLevel: aiRiskLevel,
    };

    writeCreateProjectDraftSafely(draft);
    setCreateProjectDraftHandoff(draft);

    const params = new URLSearchParams();
    if (resolvedTrades.length > 0) params.set('trades', resolvedTrades.join(','));
    if (location.secondary) params.set('location', location.secondary);
    else if (location.primary) params.set('location', location.primary);
    params.set('source', 'create-project');
    router.push(`/professionals?${params.toString()}`);
  };

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <section className={`w-full max-w-6xl mx-auto overflow-hidden transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ height: 'calc(100vh - 64px - 40px - 40px)' }}>
        <div className="mimo-panel relative h-full w-full flex flex-col overflow-hidden py-6 sm:py-8">

          <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300/60 bg-white/70">
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className="flex h-full transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${currentStep * 100}%)` }}
              >
                {steps.map((step, index) => (
                  <div
                    key={`${step.kind}-${index}`}
                    className={`flex h-full w-full shrink-0 flex-col overflow-x-hidden p-3 sm:p-4 ${
                      step.kind === 'followups' ? 'overflow-hidden' : 'overflow-y-auto'
                    }`}
                  >
                    {step.kind === 'projectDetails' && (
                      <div className={panelContentClass}>
                        <div className="flex items-center justify-between gap-2 sm:gap-3">
                          <h3 className={panelTitleClass}><span>📝</span><span>Project brief</span></h3>
                          <button
                            type="button"
                            onClick={() => setIsEmergency(v => !v)}
                            className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-white transition sm:px-4 ${
                              isEmergency
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            <span className="hidden sm:inline">{isEmergency ? '🚨 Emergency' : 'Standard'}</span>
                            <span className="sm:hidden">{isEmergency ? '🚨' : '✓'}</span>
                          </button>
                        </div>
                        <p className={panelNoteClass}>Give your project a clear title and pick a location.</p>
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Bathroom leak repair"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm sm:text-base"
                        />

                        {/* ADVISORY DISABLED July 14 Phase 2 — safety + emergency callout kept for later use */}
                        {/* — safety advisory (sky-blue box) + emergency callout (amber box) — */}

                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <h3 className={panelTitleClass}><span>📍</span><span className="hidden sm:inline">Where is this project located?</span><span className="sm:hidden">Project location</span></h3>
                          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              type="button"
                              onClick={() => handleLocationInputMode('map')}
                              className={`rounded-md px-2.5 py-1 text-[11px] transition sm:px-3 sm:py-1.5 sm:text-xs ${
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
                              className={`rounded-md px-2.5 py-1 text-[11px] transition sm:px-3 sm:py-1.5 sm:text-xs ${
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

                        {/* SUMMARY TEXTAREA DISABLED July 14 Phase 2 — kept for later use */}
                        {/* <p className={panelNoteClass}>Anything else you want to share before we lock in?</p>
                        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
                          placeholder="Add any additional context or requirements..."
                          className="w-full min-h-[110px] rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
                        /> */}

                        <div className="grid gap-1.5">
                        <h3 className={panelTitleClass}><span>📅</span><span>Site inspection on</span></h3>
                          <WorkDatePicker
                            value={siteInspectionAvailableOn ? new Date(siteInspectionAvailableOn + 'T00:00:00') : null}
                            onChange={(d) => setSiteInspectionAvailableOn(toDateKey(d))}
                            minDate={new Date()}
                            weeks={2}
                          />
                        </div>
                        <p className="text-sm italic text-slate-600">Allowing access for site inspection will ensure more complete project understanding and so higher quality, more reliable quotations, without surprises.</p>

                        {/* Now, get your prices — inline in scrollable body */}
                        <div className="mt-6 pt-4 border-t border-slate-200">
                          <h2 className="text-base font-bold text-slate-900 mb-3">Now, get your prices</h2>
                          {(!location.primary && !location.secondary) && (
                            <p className="text-xs text-amber-600 mb-2">Select a location above to continue.</p>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 space-y-2">
                              <button
                                type="button"
                                onClick={() => submitAndOpenTender()}
                                disabled={isSubmitting || (!location.primary && !location.secondary)}
                                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                              >
                                {isSubmitting ? 'Creating project...' : 'Get prices from everyone'}
                              </button>
                              <p className="text-xs text-slate-600">
                                {"We'll ask all local matching trades to send in pricing for your project."}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 space-y-2">
                              <button
                                type="button"
                                onClick={() => submitAndChoosePros()}
                                disabled={isSubmitting || (!location.primary && !location.secondary)}
                                className="w-full rounded-lg border border-[#b94e2d] bg-white px-4 py-2.5 text-sm font-semibold text-[#b94e2d] transition hover:bg-orange-50 disabled:opacity-40"
                              >
                                {"I'll choose who sends prices"}
                              </button>
                              <p className="text-xs text-slate-600">
                                Select from qualified local professionals who you want to price your project.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {step.kind === 'followups' && (
                      <div className="flex h-full min-h-0 flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className={`${panelTitleClass} min-w-0`}>
                                <span className="sm:hidden">Chat with MIMO</span>
                                <span className="hidden sm:inline">Chat with MIMO to build a complete brief.</span>
                              </h3>
                              {ttsSupported && (
                                <button
                                  type="button"
                                  onClick={() => { setListenMode(v => !v); if (listenMode) ttsStop(); }}
                                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                                    listenMode
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-300 text-slate-500'
                                  }`}
                                  title={listenMode ? 'Stop reading aloud' : 'Read messages aloud'}
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.47 4.47 0 0 0 2.5-3.5zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <p className={panelNoteClass}>The more you share, the better the quote.</p>

                            {/* REQUIREMENT CHECKLIST DISABLED July 15 — hidden to simplify chat UI */}
                            {/* <RequirementChecklist
                              trades={seedDraft?.initialData?.tradesRequired || seedDescription?.tradesRequired || []}
                              coveredTopics={wizardCoveredTopics}
                            /> */}

                            <div ref={chatContainerRef} className="flex-1 min-h-[80px] sm:min-h-[150px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                              {chatMessages.map((message, idx) => {
                                const showButtons = message.role === 'assistant' && message.options && message.options.length > 0;
                                return (
                                <div key={`chat-${idx}`}>
                                <div className={`relative max-w-[90%] whitespace-pre-wrap rounded-lg px-2.5 py-2 pr-8 text-sm leading-relaxed ${message.role === 'assistant' ? 'border border-[#F7D2C5] bg-[#FFF2EB] text-slate-800' : 'ml-auto bg-emerald-600 text-white'}`}>
                                  {renderChatMessageBody(message)}
                                  {message.role === 'assistant' && (
                                    <div className="absolute right-1 top-1">
                                      <ListenButton
                                        text={message.text}
                                        lang={preferredLanguage === 'zh-CN' ? 'zh-CN' : preferredLanguage === 'zh-HK' ? 'zh-HK' : 'en-HK'}
                                      />
                                    </div>
                                  )}
                                </div>
                                {showButtons && !chatBusy && (
                                  <div className="mt-2 flex flex-wrap gap-2 border border-dashed border-amber-400 rounded-lg p-2">
                                    <span className="w-full text-[10px] text-amber-600 font-mono">DEBUG: {message.options.length} options</span>
                                    {message.options.map((opt) => (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => sendWizardAiTurn(opt.value)}
                                        className="rounded-full border border-[#FF7F50]/30 bg-[#FFF5F0] px-3 py-1.5 text-xs font-medium text-[#B94E2D] transition hover:border-[#FF7F50] hover:bg-[#FFE8DD]"
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChatInput('');
                                        document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Reply here..."]')?.focus();
                                      }}
                                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:bg-slate-50"
                                    >
                                      Other…
                                    </button>
                                  </div>
                                )}
                                </div>
                              )})}
                              {chatBusy && (
                                <p className="text-xs text-slate-500">MIMO is thinking...</p>
                              )}
                            </div>

                            {chatError && (
                              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{chatError}</p>
                            )}

                            <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5">

                              {/* Main input row: paperclip + textarea + mic */}
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                {/* Paperclip — attach any file */}
                                <label
                                  className={`relative inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700 ${
                                    chatAttachedFiles.length >= AI_CHAT_MAX_IMAGES_PER_TURN ? 'pointer-events-none opacity-50' : ''
                                  }`}
                                  title="Attach files (max 5 MB each)"
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                  </svg>
                                  <input
                                    type="file"
                                    accept="*/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => addChatFiles(e.target.files)}
                                    disabled={chatAttachedFiles.length >= AI_CHAT_MAX_IMAGES_PER_TURN}
                                  />
                                </label>

                                {/* Camera — mobile only */}
                                <label
                                  className={`relative inline-flex h-8 w-8 sm:hidden shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700 ${
                                    chatAttachedFiles.length >= AI_CHAT_MAX_IMAGES_PER_TURN ? 'pointer-events-none opacity-50' : ''
                                  }`}
                                  title="Take a photo"
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                    <circle cx="12" cy="13" r="4" />
                                  </svg>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => addChatFiles(e.target.files)}
                                    disabled={chatAttachedFiles.length >= AI_CHAT_MAX_IMAGES_PER_TURN}
                                  />
                                </label>

                                <textarea
                                  value={chatInput}
                                  onChange={(e) => setChatInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      if (chatInput.trim()) {
                                        void sendWizardAiTurn();
                                      } else if (aiChatCanContinue) {
                                        handleAiContinue();
                                      }
                                    }
                                  }}
                                  rows={1}
                                  placeholder="Reply here..."
                                  className="min-h-[44px] w-full resize-none rounded-lg border-0 bg-transparent px-1 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none"
                                />

                                <VoiceInputButton
                                  lang={preferredLanguage === 'zh-CN' ? 'zh-CN' : preferredLanguage === 'zh-HK' ? 'yue-Hant-HK' : 'en-HK'}
                                  onTranscript={(text) => setChatInput(prev => prev ? `${prev} ${text}` : text)}
                                  className="!border-[#FF7F50] !bg-[#FF7F50] !text-white hover:!bg-[#e86840] hover:!border-[#e86840]"
                                />
                              </div>



                            </div>
                      </div>
                    )}

                    {step.kind === 'images' && (
                      <div className={panelContentClass}>
                        <h3 className={panelTitleClass}><span>�</span><span>Files, photos & documents</span></h3>
                        <p className={panelNoteClass}>Attach any photos, plans, or documents that will help pros understand your project.</p>

                        <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-3 py-3 text-base font-semibold text-white hover:bg-emerald-700">
                          Add files
                          <input
                            type="file"
                            accept="*/*"
                            multiple
                            className="hidden"
                            onChange={(e) => addProjectFiles(e.target.files)}
                          />
                        </label>

                        {projectFileError && <p className="text-sm text-rose-700">{projectFileError}</p>}

                        {(existingImageUrls.length > 0 || chatAttachedFiles.length > 0 || projectFiles.length > 0) && (
                        <div className="space-y-2">
                          <p className={panelNoteClass}>Files already attached.</p>
                          <div className="flex gap-3 overflow-x-auto pb-1">
                            {/* Previously uploaded files (from drafts) */}
                            {existingImageUrls.map((url) => {
                              const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
                              const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
                              return (
                              <div key={url} className="relative min-w-32 rounded-lg border border-slate-200 bg-white p-2" title={url.split('/').pop() || url}>
                                {isImage ? (
                                  <div className="relative h-24 overflow-hidden rounded">
                                    <Image src={resolveMediaAssetUrl(url)} alt="Project file" fill className="object-cover" unoptimized />
                                  </div>
                                ) : (
                                  <div className="flex h-24 flex-col items-center justify-center rounded bg-slate-100">
                                    <span className="text-xs font-bold uppercase text-slate-500">{ext || 'FILE'}</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeImageUrl(url)}
                                  className="mt-2 w-full rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                                >
                                  Remove
                                </button>
                              </div>
                              );
                            })}
                            {/* Files from chat (step 1) */}
                            {chatAttachedFiles.map((file, index) => {
                              const ext = file.name.split('.').pop()?.toLowerCase() || '';
                              const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
                              const previewUrl = isImage ? URL.createObjectURL(file) : null;
                              return (
                              <div key={`cf-${index}`} className="relative min-w-32 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2" title={`From chat: ${file.name}`}>
                                {isImage && previewUrl ? (
                                  <div className="relative h-24 overflow-hidden rounded">
                                    <Image src={previewUrl} alt={file.name} fill className="object-cover" unoptimized />
                                  </div>
                                ) : (
                                  <div className="flex h-24 flex-col items-center justify-center rounded bg-slate-100">
                                    <span className="text-xs font-bold uppercase text-slate-500">{ext || 'FILE'}</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setChatAttachedFiles((prev) => prev.filter((_, i) => i !== index))}
                                  className="mt-2 w-full rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                                >
                                  Remove
                                </button>
                              </div>
                              );
                            })}
                            {/* Files added on this step */}
                            {projectFiles.map((file, index) => {
                              const ext = file.name.split('.').pop()?.toLowerCase() || '';
                              const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
                              const previewUrl = isImage ? URL.createObjectURL(file) : null;
                              return (
                              <div key={`pf-${index}`} className="relative min-w-32 rounded-lg border border-slate-200 bg-white p-2" title={file.name}>
                                {isImage && previewUrl ? (
                                  <div className="relative h-24 overflow-hidden rounded">
                                    <Image src={previewUrl} alt={file.name} fill className="object-cover" unoptimized />
                                  </div>
                                ) : (
                                  <div className="flex h-24 flex-col items-center justify-center rounded bg-slate-100">
                                    <span className="text-xs font-bold uppercase text-slate-500">{ext || 'FILE'}</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeProjectFile(index)}
                                  className="mt-2 w-full rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                                >
                                  Remove
                                </button>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                        )}
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2">
              {/* Progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-emerald-500 transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              {/* Navigation */}
              <div className="mt-2 flex items-center justify-between gap-2">
                {currentStep > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 sm:px-3 sm:py-2 sm:text-sm"
                >
                  Back
                </button>
                )}
                {currentStep === 0 && chatAttachedFiles.length > 0 && (
                <div className="flex flex-col gap-1 max-w-[60%]">
                  {chatFileError && (
                    <p className="text-[10px] leading-tight text-amber-700 animate-fadeOut">{chatFileError}</p>
                  )}
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {chatAttachedFiles.map((file, index) => {
                      const ext = file.name.split('.').pop()?.toLowerCase() || '';
                      const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
                      const previewUrl = isImage ? URL.createObjectURL(file) : null;
                      return (
                      <div key={`nav-file-${index}`} className="relative h-8 w-8 shrink-0 rounded border border-slate-200 bg-white" title={file.name}>
                        {isImage && previewUrl ? (
                          <Image src={previewUrl} alt={file.name} fill className="rounded object-cover" unoptimized />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded bg-slate-100">
                            <span className="text-[8px] font-bold uppercase text-slate-500">{ext || 'F'}</span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                    <span className={`text-[10px] shrink-0 ${chatAttachedFiles.length >= AI_CHAT_MAX_IMAGES_PER_TURN ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{chatAttachedFiles.length}/{AI_CHAT_MAX_IMAGES_PER_TURN} file{chatAttachedFiles.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                )}
                {currentStep === 0 && chatAttachedFiles.length === 0 && <div />}

                {activeStep?.kind === 'images' ? (
                  currentStep < steps.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (existingImageUrls.length === 0 && chatAttachedFiles.length === 0 && projectFiles.length === 0) {
                          setShowNoFilesWarning(true);
                        } else {
                          goNext();
                        }
                      }}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition sm:px-3 sm:py-2 sm:text-sm"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (existingImageUrls.length === 0 && chatAttachedFiles.length === 0 && projectFiles.length === 0) {
                          setShowNoFilesWarning(true);
                        } else {
                          submitWizard();
                        }
                      }}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition sm:px-3 sm:py-2 sm:text-sm"
                    >
                      Submit project
                    </button>
                  )
                ) : currentStep < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canGoNext}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    Next
                  </button>
                ) : activeStep?.kind !== 'projectDetails' ? (
                  <button
                    type="button"
                    onClick={submitWizard}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition sm:px-3 sm:py-2 sm:text-sm"
                  >
                    Final checks
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {seedLoaded && !title && !summary && followUpQuestions.length === 0 && (
        <section className="mt-6 sm:-mx-6 sm:px-6">
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

      {expandedServiceOffer && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                <Image src="/assets/mimo.webp" alt="MIMO" width={36} height={36} className="h-9 w-9 object-contain" unoptimized />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-slate-900">{SERVICE_OFFER_COPY[expandedServiceOffer].title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{SERVICE_OFFER_COPY[expandedServiceOffer].modalIntro}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Included</p>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
                {SERVICE_OFFER_COPY[expandedServiceOffer].details.map((detail) => (
                  <li key={detail} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#F26F63]" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {SERVICE_OFFER_COPY[expandedServiceOffer].price && (
              <div className="mt-4 rounded-2xl border border-[#F7D2C5] bg-[#FFF2EB] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A94237]">Service fee</p>
                <p className="mt-1 text-base font-semibold text-[#8A3A31]">{SERVICE_OFFER_COPY[expandedServiceOffer].price}</p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handleServiceOfferChoice(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => handleServiceOfferChoice(true)}
                className="rounded-lg border border-[#E95E51] bg-[#F26F63] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E95E51]"
              >
                Add Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Skip Date Prompt Modal ── */}
      {skipPrompt && (
        <div className="fixed inset-0 z-[73] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/45 bg-[#FCF8EE] p-6 shadow-2xl text-center space-y-4">
            <p className="text-2xl">📅</p>
            <h3 className="text-lg font-bold text-slate-900">
              {skipPrompt === 'site'
                ? 'Site inspection recommended'
                : 'Completion date recommended'}
            </h3>
            <p className="text-sm leading-relaxed text-slate-600">
              {skipPrompt === 'site'
                ? 'We highly recommend allowing site inspection when time allows. It leads to more accurate quotes and fewer surprises.'
                : "It's good to let the professional have a timeline for completion. This helps them plan and give you a realistic quote."}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSkipPrompt(null)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Set date
              </button>
              <button
                type="button"
                onClick={() => {
                  if (skipPrompt === 'site') {
                    setSkipPrompt('end');
                    if (!endDate) {
                      // No end date either — chain to end prompt
                      return;
                    }
                    setSkipPrompt(null);
                    hasManualStepNavigationRef.current = true;
                    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
                  } else {
                    setSkipPrompt(null);
                    hasManualStepNavigationRef.current = true;
                    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
                  }
                }}
                className="flex-1 rounded-lg bg-[#F97362] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e8624f]"
              >
                Skip date
              </button>
            </div>
          </div>
        </div>
      )}
      {showNoFilesWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowNoFilesWarning(false); }}>
          <div className="w-full max-w-sm rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] p-6 shadow-2xl text-center">
            <p className="text-base font-semibold text-slate-800 leading-relaxed">
              Images and documents help pros understand your project. Consider adding some now.
            </p>
            <div className="mt-5 flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => setShowNoFilesWarning(false)}
                className="min-w-[100px] rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNoFilesWarning(false);
                  if (currentStep < steps.length - 1) {
                    goNext();
                  } else {
                    submitWizard();
                  }
                }}
                className="min-w-[100px] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
