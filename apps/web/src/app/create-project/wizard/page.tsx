'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AiProjectBriefModal } from '@/components/ai-project-brief-modal';
import type { CanonicalLocation } from '@/components/location-select';
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

export default function CreateProjectWizardPage() {
  const router = useRouter();
  const { isLoggedIn, userLocation } = useAuth();

  const [hydrated, setHydrated] = useState(false);

  const [seedDraft, setSeedDraft] = useState<CreateProjectDraft | null>(null);
  const [seedDescription, setSeedDescription] = useState<ProjectDescriptionData | null>(null);
  const [seedLoaded, setSeedLoaded] = useState(false);

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

  const wizardSeed = useMemo(() => {
    if (!seedLoaded) return null;

    const title =
      seedDraft?.initialData?.projectName ||
      seedDescription?.title ||
      '';

    const summary =
      seedDescription?.description ||
      seedDraft?.initialData?.notes ||
      '';

    const scope =
      seedDraft?.initialData?.notes ||
      seedDescription?.description ||
      '';

    const assumptions = seedDraft?.initialData?.aiFrom?.assumptions || [];

    const location = seedDraft?.initialData?.location || seedDescription?.location;

    const emergency = seedDraft?.initialData?.isEmergency ?? seedDescription?.isEmergency;

    const followUpQuestions = (
      seedDescription?.followUpQuestions ||
      seedDraft?.followUpQuestions ||
      []
    )
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (!title && !summary && !scope && followUpQuestions.length === 0) return null;

    return {
      title,
      summary,
      scope,
      assumptions,
      location,
      emergency,
      followUpQuestions,
    };
  }, [seedLoaded, seedDraft, seedDescription]);

  const handleComplete = (payload: {
    title: string;
    summary: string;
    location: CanonicalLocation;
    isEmergency: boolean;
    followUpAnswers: Array<{ question: string; answer: string }>;
  }) => {
    const followUpBlock = (payload.followUpAnswers || [])
      .map((item) => ({
        question: (item.question || '').trim(),
        answer: (item.answer || '').trim(),
      }))
      .filter((item) => item.question.length > 0 && item.answer.length > 0)
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join('\n\n');

    const mergedSummary = [
      (payload.summary || '').trim(),
      followUpBlock ? `Additional Questions & Answers:\n${followUpBlock}` : '',
    ].filter(Boolean).join('\n\n');

    const resolvedRegion = [payload.location.secondary, payload.location.primary]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join(', ');

    const nextDraft: CreateProjectDraft = {
      initialData: {
        ...(seedDraft?.initialData || {}),
        projectName: payload.title || seedDraft?.initialData?.projectName || '',
        notes: mergedSummary || seedDraft?.initialData?.notes || '',
        location: payload.location,
        region: resolvedRegion || seedDraft?.initialData?.region || '',
        isEmergency: payload.isEmergency,
        projectScale:
          normalizeProjectScale(seedDraft?.initialData?.projectScale) ||
          normalizeProjectScale(seedDescription?.projectScale) ||
          undefined,
        tradesRequired:
          seedDraft?.initialData?.tradesRequired ||
          seedDescription?.tradesRequired ||
          [],
      },
      selectedProfessionals: seedDraft?.selectedProfessionals || [],
      aiIntakeId: seedDraft?.aiIntakeId,
      followUpQuestions: wizardSeed?.followUpQuestions || [],
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
      followUpQuestions: wizardSeed?.followUpQuestions || [],
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
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Let’s frame your project before publishing</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
            We will confirm title, location, urgency, and follow-up details, then move you to final project review.
          </p>
        </div>
      </section>

      <AiProjectBriefModal
        key={`${wizardSeed?.title || 'wizard'}-${(wizardSeed?.followUpQuestions || []).join('|')}`}
        isOpen={Boolean(wizardSeed)}
        onClose={() => router.push('/')}
        initialTitle={wizardSeed?.title || ''}
        initialSummary={wizardSeed?.summary || ''}
        initialScope={wizardSeed?.scope || ''}
        initialAssumptions={wizardSeed?.assumptions || []}
        initialLocation={wizardSeed?.location}
        fallbackLocation={userLocation}
        initialEmergency={wizardSeed?.emergency}
        followUpQuestions={wizardSeed?.followUpQuestions || []}
        onComplete={handleComplete}
      />

      {seedLoaded && !wizardSeed && (
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
