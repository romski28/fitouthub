'use client';

type CreateProjectDraftValue = {
  initialData?: {
    projectName?: string;
    notes?: string;
    tradesRequired?: string[];
    region?: string;
    location?: {
      primary?: string;
      secondary?: string;
      tertiary?: string;
    };
    isEmergency?: boolean;
    onlySelectedProfessionalsCanBid?: boolean;
    aiFrom?: {
      assumptions?: string[];
      risks?: string[];
      safety?: unknown;
    };
  };
  selectedProfessionals?: Array<{
    id: string;
    professionType: 'contractor' | 'company' | 'reseller';
    email: string;
    phone: string;
    status: 'pending' | 'approved' | 'suspended' | 'inactive';
    rating: number;
    fullName?: string | null;
    businessName?: string | null;
  }>;
  aiIntakeId?: string;
};

const CREATE_PROJECT_DRAFT_KEY = 'createProjectDraft';

const isQuotaExceeded = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const code = (error as { code?: number }).code;
  return name === 'QuotaExceededError' || code === 22 || code === 1014;
};

const cropText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const toLimitedStringArray = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => cropText(item, maxLength))
    .filter((item) => item.length > 0);
};

const compactCreateProjectDraft = (value: CreateProjectDraftValue): CreateProjectDraftValue => {
  const initialData = value.initialData || {};

  return {
    initialData: {
      projectName: cropText(initialData.projectName, 180),
      notes: cropText(initialData.notes, 4000),
      tradesRequired: toLimitedStringArray(initialData.tradesRequired, 12, 80),
      region: cropText(initialData.region, 200),
      location: initialData.location
        ? {
            primary: cropText(initialData.location.primary, 80),
            secondary: cropText(initialData.location.secondary, 80),
            tertiary: cropText(initialData.location.tertiary, 80),
          }
        : undefined,
      isEmergency: Boolean(initialData.isEmergency),
      onlySelectedProfessionalsCanBid: initialData.onlySelectedProfessionalsCanBid ?? true,
      aiFrom: initialData.aiFrom
        ? {
            assumptions: toLimitedStringArray(initialData.aiFrom.assumptions, 6, 220),
            risks: toLimitedStringArray(initialData.aiFrom.risks, 6, 220),
            safety: initialData.aiFrom.safety,
          }
        : undefined,
    },
    selectedProfessionals: Array.isArray(value.selectedProfessionals)
      ? value.selectedProfessionals.slice(0, 30)
      : undefined,
    aiIntakeId: value.aiIntakeId,
  };
};

export const writeCreateProjectDraftSafely = (value: CreateProjectDraftValue): boolean => {
  if (typeof window === 'undefined') return false;

  const attempts: Array<CreateProjectDraftValue> = [
    value,
    compactCreateProjectDraft(value),
    {
      initialData: {
        projectName: cropText(value.initialData?.projectName, 180),
        notes: cropText(value.initialData?.notes, 2500),
        tradesRequired: toLimitedStringArray(value.initialData?.tradesRequired, 8, 80),
        location: value.initialData?.location,
        isEmergency: Boolean(value.initialData?.isEmergency),
      },
      aiIntakeId: value.aiIntakeId,
    },
  ];

  for (const attempt of attempts) {
    try {
      window.sessionStorage.setItem(CREATE_PROJECT_DRAFT_KEY, JSON.stringify(attempt));
      return true;
    } catch (error) {
      if (!isQuotaExceeded(error)) {
        console.warn('[draft-storage] Failed to save createProjectDraft:', error);
        return false;
      }
      try {
        window.sessionStorage.removeItem(CREATE_PROJECT_DRAFT_KEY);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  return false;
};
