'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';
import { ProjectForm } from '@/components/project-form';
import { ProjectDescriptionModal } from '@/components/project-description-modal';
import { AssistRequestModal, type AssistRequestModalSubmit } from '@/components/assist-request-modal';
import type { ProjectFormData } from '@/components/project-form';
import type { CanonicalLocation } from '@/components/location-select';
import type { Professional } from '@/lib/types';
import {
  clearCreateProjectDraftHandoff,
  clearProjectDescriptionHandoff,
  getCreateProjectDraftHandoff,
  getProjectDescriptionHandoff,
} from '@/lib/create-project-handoff';
import { getUploadResponseKeys } from '@/lib/media-assets';

interface ProjectDescriptionData {
  title?: string;
  description: string;
  projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
  isEmergency?: boolean;
  profession?: string;
  location?: CanonicalLocation;
  tradesRequired: string[];
  followUpQuestions?: string[];
}

interface AssistDraft {
  formData: ProjectFormData;
  pendingFiles: File[];
  removedPhotos: string[];
}

interface CreateProjectDraft {
  initialData?: Partial<ProjectFormData>;
  selectedProfessionals?: Array<Professional & { requestedTrades?: string[] }>;
  aiIntakeId?: string;
  followUpQuestions?: string[];
}

type SelectedProfessionalWithScope = Professional & { requestedTrades?: string[] };

const normalizeProjectScale = (value?: string | null): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null => {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'SCALE_1' || normalized === 'SCALE_2' || normalized === 'SCALE_3') {
    return normalized;
  }
  return null;
};

const PROJECT_SELECTABLE_TYPES = new Set<Professional['professionType']>(['contractor', 'company']);

const filterProjectSelectableProfessionals = (professionals: Professional[]) => {
  return professionals.filter((professional) => PROJECT_SELECTABLE_TYPES.has(professional.professionType));
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

export default function CreateProjectPage() {
  const router = useRouter();
  const t = useTranslations('project');
  const { isLoggedIn, accessToken, user, userLocation } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [descriptionData, setDescriptionData] = useState<ProjectDescriptionData | null>(null);
  const [showAssistModal, setShowAssistModal] = useState(false);
  const [assistDraft, setAssistDraft] = useState<AssistDraft | null>(null);
  const [initialFormData, setInitialFormData] = useState<Partial<ProjectFormData>>({});
  const [selectedProfessionals, setSelectedProfessionals] = useState<SelectedProfessionalWithScope[]>([]);
  const [aiIntakeId, setAiIntakeId] = useState<string | null>(null);
  const [openTenderLoading, setOpenTenderLoading] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && isLoggedIn === false) {
      router.push('/');
    }
  }, [hydrated, isLoggedIn, router]);

  useEffect(() => {
    if (hydrated && isLoggedIn) {
      const handoffDebug =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('debugFlow') === '1' ||
          window.localStorage.getItem('fh_debug_handoff') === '1');

      const storedDraft = sessionStorage.getItem('createProjectDraft');
      let parsedDraftForDebug: CreateProjectDraft | null = null;
      let parsedStoredDraft: CreateProjectDraft | null = null;
      if (storedDraft) {
        try {
          const parsed = JSON.parse(storedDraft) as CreateProjectDraft;
          parsedDraftForDebug = parsed;
          parsedStoredDraft = parsed;
        } catch (e) {
          console.warn('[create-project] Failed to parse createProjectDraft:', e);
        } finally {
          sessionStorage.removeItem('createProjectDraft');
        }
      }

      const memoryDraft = getCreateProjectDraftHandoff();
      if (!parsedDraftForDebug && memoryDraft) {
        parsedDraftForDebug = memoryDraft;
      }

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

      if (mergedDraft) {
        setInitialFormData(mergedDraft.initialData || {});
        setSelectedProfessionals(
          Array.isArray(mergedDraft.selectedProfessionals)
            ? (filterProjectSelectableProfessionals(mergedDraft.selectedProfessionals) as SelectedProfessionalWithScope[])
            : [],
        );
        if (mergedDraft.aiIntakeId) {
          setAiIntakeId(mergedDraft.aiIntakeId);
        }
      }

      // Check if we have description data from sessionStorage (from projects list)
      const stored = sessionStorage.getItem('projectDescription');
      let parsedDescriptionForDebug: ProjectDescriptionData | null = null;
      if (stored) {
        try {
          const parsedDescription = JSON.parse(stored) as ProjectDescriptionData;
          console.log('[HANDOFF-READ] Found projectDescription in sessionStorage:', parsedDescription);
          parsedDescriptionForDebug = parsedDescription;
          setDescriptionData(parsedDescription);
          sessionStorage.removeItem('projectDescription');
        } catch (e) {
          console.warn('[create-project] Failed to parse sessionStorage data:', e);
        }
      }

      if (!stored) {
        const memoryDescription = getProjectDescriptionHandoff();
        console.log('[HANDOFF-READ] Checking memory for projectDescription:', memoryDescription);
        if (memoryDescription) {
          console.log('[HANDOFF-READ] Found projectDescription in memory:', {
            title: memoryDescription.title,
            followUpQuestions: memoryDescription.followUpQuestions,
          });
          parsedDescriptionForDebug = {
            description: memoryDescription.description || '',
            title: memoryDescription.title,
            projectScale: normalizeProjectScale(memoryDescription.projectScale) || undefined,
            isEmergency: memoryDescription.isEmergency,
            profession: memoryDescription.profession,
            location: memoryDescription.location,
            tradesRequired: memoryDescription.tradesRequired || [],
            followUpQuestions: memoryDescription.followUpQuestions || [],
          };
          setDescriptionData(parsedDescriptionForDebug);
        }
      }

      if (handoffDebug) {
        const resolvedTitle =
          parsedDraftForDebug?.initialData?.projectName || parsedDescriptionForDebug?.title || '';
        const resolvedNotes =
          parsedDraftForDebug?.initialData?.notes || parsedDescriptionForDebug?.description || '';
        const resolvedEmergency =
          parsedDraftForDebug?.initialData?.isEmergency ?? parsedDescriptionForDebug?.isEmergency;

        console.info('[AI-HANDOFF][create-project] loaded handoff data', {
          draft: {
            title: parsedDraftForDebug?.initialData?.projectName,
            notesLength: (parsedDraftForDebug?.initialData?.notes || '').length,
            isEmergency: parsedDraftForDebug?.initialData?.isEmergency,
            selectedProfessionals: parsedDraftForDebug?.selectedProfessionals?.length || 0,
          },
          projectDescription: {
            title: parsedDescriptionForDebug?.title,
            notesLength: (parsedDescriptionForDebug?.description || '').length,
            isEmergency: parsedDescriptionForDebug?.isEmergency,
          },
          resolved: {
            title: resolvedTitle,
            notesLength: resolvedNotes.length,
            isEmergency: resolvedEmergency,
          },
        });
      }

      clearCreateProjectDraftHandoff();
      clearProjectDescriptionHandoff();

      // Keep create-project as a stable review page on refresh.
      // Do not auto-open the description modal when handoff data is absent.
    }
  }, [hydrated, isLoggedIn]);

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800" />;
  }

  if (isLoggedIn === false) return null;

  const uploadPendingFiles = async (pendingFiles: File[]) => {
    let photoUrls: string[] = [];
    if (pendingFiles.length > 0) {
      const uploadFormData = new FormData();
      pendingFiles.forEach((f) => uploadFormData.append("files", f));
      const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/uploads`, {
        method: "POST",
        body: uploadFormData,
      });
      if (!uploadRes.ok) {
        const message = await uploadRes.text();
        throw new Error(message || "Failed to upload files");
      }
      const uploadData = await uploadRes.json();
      photoUrls = getUploadResponseKeys(uploadData);
    }
    return photoUrls;
  };

  const buildProjectPayload = (
    formData: ProjectFormData,
    photoUrls: string[],
    professionalIds: string[] = [],
    professionalTradeScopes: Array<{ professionalId: string; requestedTrades: string[] }> = [],
  ) => {
    const locationRegion = [
      formData.location?.primary,
      formData.location?.secondary,
      formData.location?.tertiary,
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(', ');
    const region = locationRegion || formData.region || '';

    if (!formData.projectName?.trim() || !region.trim()) {
      throw new Error('Project name and region are required');
    }

    const resolvedTradesRequired = normalizeUniqueStringList(
      formData.tradesRequired,
      initialFormData.tradesRequired,
      descriptionData?.tradesRequired,
      descriptionData?.profession ? [descriptionData.profession] : [],
      professionalTradeScopes.flatMap((scope) => scope.requestedTrades || []),
    );

    if (professionalIds.length > 0 && resolvedTradesRequired.length === 0) {
      throw new Error('Please select at least one required trade before opening bidding.');
    }

    return {
      projectName: formData.projectName,
      clientName: formData.clientName,
      region,
      budget: formData.budget ? parseFloat(String(formData.budget)) : null,
      notes: formData.notes,
      status: 'pending',
      professionalIds,
      professionalTradeScopes,
      userId: user?.id,
      tradesRequired: resolvedTradesRequired,
      onlySelectedProfessionalsCanBid: formData.onlySelectedProfessionalsCanBid ?? true,
      photos: photoUrls.length > 0 ? photoUrls.map((url) => ({ url })) : [],
      userPrompt: descriptionData?.description || null,
      aiIntakeId: aiIntakeId || null,
      projectScale: normalizeProjectScale(formData.projectScale || descriptionData?.projectScale || null),
      endDate: formData.endDate || null,
      siteInspectionAvailableOn: formData.siteInspectionAvailableOn || null,
      isEmergency: formData.isEmergency ?? false,
      requiresSurveyService: formData.requiresSurveyService ?? false,
      requiresDesignService: formData.requiresDesignService ?? false,
    };
  };

  const getPersistedPhotoUrls = (formData: ProjectFormData, newlyUploadedPhotoUrls: string[]) => {
    const existingFromForm = (formData.existingPhotos || [])
      .map((photo) => photo?.url)
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

    const fallbackFromPhotoUrls = (formData.photoUrls || [])
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

    const base = existingFromForm.length > 0 ? existingFromForm : fallbackFromPhotoUrls;
    return Array.from(new Set([...base, ...newlyUploadedPhotoUrls]));
  };

  const createProject = async (payload: ReturnType<typeof buildProjectPayload>) => {
    const response = await fetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: 'Failed to create project' }));
      console.error('[create-project] Error response:', data);
      throw new Error(data.message || `Server error: ${response.status}`);
    }

    return response.json();
  };

  const handleSubmit = async (formData: ProjectFormData, pendingFiles: File[], removedPhotos: string[]) => {
    setError(null);

    setIsSubmitting(true);
    try {
      const uploadedPhotoUrls = await uploadPendingFiles(pendingFiles);
      const photoUrls = getPersistedPhotoUrls(formData, uploadedPhotoUrls);
      const payload = buildProjectPayload(
        formData,
        photoUrls,
        selectedProfessionals.map((professional) => professional.id),
        selectedProfessionals.map((professional) => ({
          professionalId: professional.id,
          requestedTrades: Array.isArray(professional.requestedTrades)
            ? professional.requestedTrades.filter((trade) => typeof trade === 'string' && trade.trim().length > 0)
            : [],
        })),
      );

      console.log('[create-project] Submitting payload:', payload);

      const project = await createProject(payload);
      console.log('[create-project] Project created successfully:', project);
      toast.success(
        selectedProfessionals.length > 0
          ? 'Project created and bidding is now open to your selected professionals.'
          : 'Project saved. You can request quotes when you are ready.',
      );
      const shouldLaunchSurveyStep = payload.requiresSurveyService === true;
      router.push(
        shouldLaunchSurveyStep
          ? `/projects/${project.id}?launchNextStep=BOOK_MIMO_SURVEY`
          : `/projects/${project.id}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      console.error('[create-project] Error:', err);
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssist = async (formData: ProjectFormData, pendingFiles: File[], removedPhotos: string[]) => {
    setError(null);
    setAssistDraft({ formData, pendingFiles, removedPhotos });
    setShowAssistModal(true);
  };

  const handleOpenTender = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      // Create project without pre-selected professionals
      const emptyFormData = {
        ...(initialFormData as ProjectFormData),
        projectName: initialFormData.projectName || descriptionData?.title || 'New Project',
        notes: initialFormData.notes || descriptionData?.description || '',
        isEmergency: initialFormData.isEmergency ?? descriptionData?.isEmergency ?? false,
        tradesRequired: initialFormData.tradesRequired?.length
          ? initialFormData.tradesRequired
          : (descriptionData?.tradesRequired || []),
        location: initialFormData.location || descriptionData?.location || userLocation || undefined,
        clientName: initialFormData.clientName || (user?.firstName && user?.surname ? `${user.firstName} ${user.surname}` : ''),
        onlySelectedProfessionalsCanBid: false,
      };
      const payload = buildProjectPayload(emptyFormData, [], [], []);
      const project = await createProject(payload);

      // Open tender to all matching professionals
      const res = await fetch(`${API_BASE_URL}/projects/${project.id}/open-tender`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Failed to start open tender' }));
        throw new Error(data.message || `Server error: ${res.status}`);
      }

      toast.success('Open tender started — invitations sent to all matching professionals.');
      router.push(`/projects/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start open tender';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitAssistRequest = async (assistConfig: AssistRequestModalSubmit) => {
    if (!assistDraft) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const uploadedPhotoUrls = await uploadPendingFiles(assistDraft.pendingFiles);
      const photoUrls = getPersistedPhotoUrls(assistDraft.formData, uploadedPhotoUrls);
      const payload = {
        ...buildProjectPayload(assistDraft.formData, photoUrls, []),
        onlySelectedProfessionalsCanBid: true,
      };
      const project = await createProject(payload);

      const assistRes = await fetch(`${API_BASE_URL}/assist-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          userId: user?.id,
          clientName: payload.clientName,
          projectName: payload.projectName,
          notes: assistConfig.notes,
          contactMethod: assistConfig.contactMethod,
          requestedCallAt: assistConfig.requestedCallAt,
          requestedCallTimezone: assistConfig.requestedCallTimezone,
        }),
      });

      if (!assistRes.ok) {
        const data = await assistRes.json().catch(() => ({ message: 'Failed to request assistance' }));
        throw new Error(data.message || `Server error: ${assistRes.status}`);
      }

      setShowAssistModal(false);
      setAssistDraft(null);

      toast.success(
        assistConfig.contactMethod === 'call'
          ? 'Project created and call request sent to MIMO.'
          : assistConfig.contactMethod === 'whatsapp'
            ? 'Project created and WhatsApp request sent to MIMO.'
            : 'Project created and chat assistance requested.',
      );

      router.push(`/projects/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request assistance';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const invitedCount = selectedProfessionals.length;
  const selectedProfessionalNames = selectedProfessionals.map(
    (professional) =>
      professional.businessName || professional.fullName || professional.email || 'Professional',
  );
  const emergencySummary = initialFormData.isEmergency ?? descriptionData?.isEmergency;
  const resolvedExistingPhotos = initialFormData.existingPhotos?.length
    ? initialFormData.existingPhotos.filter((photo): photo is { id?: string; url: string; note?: string | null } => Boolean(photo?.url))
    : (initialFormData.photoUrls || []).filter((url): url is string => Boolean(url && url.trim()));
  return (
    <>
      <ProjectDescriptionModal
        isOpen={showDescriptionModal}
        onSubmit={(data) => {
          console.log('[create-project] Description data received:', data);
          setDescriptionData(data);
          setShowDescriptionModal(false);
        }}
        onCancel={() => router.push('/projects')}
      />

      <AssistRequestModal
        key={showAssistModal ? `${assistDraft?.formData.projectName || 'assist'}-${assistDraft?.formData.notes || ''}-${assistDraft?.pendingFiles.length || 0}` : 'assist-closed'}
        isOpen={showAssistModal}
        onClose={() => {
          if (isSubmitting) return;
          setShowAssistModal(false);
        }}
        onSubmit={submitAssistRequest}
        isSubmitting={isSubmitting}
        error={error}
        initialNotes={assistDraft?.formData.notes || descriptionData?.description || ''}
        projectName={assistDraft?.formData.projectName || descriptionData?.profession}
      />

      <div className="mx-auto max-w-6xl px-4 py-8 pb-32 sm:px-6 lg:px-8">
        <section className="mimo-panel overflow-hidden text-slate-900">
          <div className="space-y-6 px-6 py-6">
            <div className="min-w-0 space-y-3">
              <p className="mimo-panel-eyebrow">Project creation</p>
              <h1 className="mimo-panel-title-xl break-words">
                {emergencySummary ? '🚨 ' : ''}
                {initialFormData.projectName || descriptionData?.title || 'New Project'}
              </h1>
              <p className="mimo-panel-body max-w-2xl">Review the final brief, confirm your recipients, and make sure your images are ready before you request quotes.</p>
            </div>
          </div>
        </section>

        <section className="mimo-panel mimo-panel-padding mt-6 text-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="mimo-panel-eyebrow">Bidding recipients</p>
              <h2 className="mimo-panel-title-lg">
                {invitedCount > 0
                  ? `${invitedCount} selected professional${invitedCount === 1 ? '' : 's'} will be invited when you submit`
                  : 'No professionals selected yet'}
              </h2>
              <p className="mimo-panel-body max-w-2xl">
                {invitedCount > 0
                  ? 'These professionals will be linked to the project immediately and quotes will be requested as soon as you confirm.'
                  : 'This project will be saved without invitations. You can still invite professionals later from the project list or details page.'}
              </p>
            </div>

            {invitedCount > 0 ? (
              <div className="space-y-3">
                <div className="flex max-w-2xl flex-wrap gap-2">
                  {selectedProfessionalNames.map((name, index) => (
                    <span
                      key={`${name}-${index}`}
                      className="rounded-full border border-[rgba(185,78,45,0.16)] bg-[rgba(255,250,240,0.92)] px-3 py-1.5 text-sm font-medium text-[rgba(185,78,45,0.92)]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set('selectedIds', selectedProfessionals.map(p => p.id).join(','));
                    const trades = initialFormData.tradesRequired?.length
                      ? initialFormData.tradesRequired
                      : descriptionData?.tradesRequired;
                    if (trades?.length) params.set('trades', trades.join(','));
                    const loc = initialFormData.location || descriptionData?.location || userLocation;
                    const locStr = [loc?.secondary, loc?.primary].filter(Boolean).join(', ');
                    if (locStr) params.set('location', locStr);
                    params.set('source', 'create-project');
                    router.push(`/professionals?${params.toString()}`);
                  }}
                  className="inline-flex items-center gap-1 rounded-2xl border border-[#b94e2d] bg-white px-4 py-2 text-sm font-semibold text-[#b94e2d] transition hover:bg-orange-50"
                >
                  ← Return to selection
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/professionals')}
                className="shrink-0 rounded-2xl bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a84426]"
              >
                Go back to professionals → 
              </button>
            )}
          </div>

          {/* Open tender button */}
          <div className="mt-4 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={async () => {
                setOpenTenderLoading(true);
                try {
                  await handleOpenTender();
                } finally {
                  setOpenTenderLoading(false);
                }
              }}
              disabled={openTenderLoading || isSubmitting}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
            >
              {openTenderLoading ? 'Starting open tender...' : 'Start open tender to all matching professionals'}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              All professionals matching your trade and location will be invited to quote.
            </p>
          </div>
        </section>

        {!showDescriptionModal && (
          <div className="mimo-panel mimo-panel-padding mt-8 text-slate-900">
            <div className="px-1 pb-4">
              <p className="mimo-panel-eyebrow">Project review</p>
              <h2 className="mimo-panel-title-lg">Review project brief</h2>
              <p className="mimo-panel-body mt-1">
                Confirm the brief, attachments, and final bidding setup before you submit.
              </p>
            </div>

            <ProjectForm
              mode="create"
              key={JSON.stringify({
                descriptionData,
                initialFormData,
                selectedProfessionalIds: selectedProfessionals.map((professional) => professional.id),
              })}
              initialData={{
                ...initialFormData,
                clientName: user?.firstName && user?.surname ? `${user.firstName} ${user.surname}` : '',
                projectName: initialFormData.projectName || descriptionData?.title || '',
                notes: initialFormData.notes || descriptionData?.description || '',
                isEmergency: initialFormData.isEmergency ?? descriptionData?.isEmergency,
                tradesRequired: initialFormData.tradesRequired?.length
                  ? initialFormData.tradesRequired
                  : (descriptionData?.tradesRequired || []),
                location: initialFormData.location || descriptionData?.location || userLocation || undefined,
                photoUrls: initialFormData.photoUrls || [],
                existingPhotos: resolvedExistingPhotos.map((photoOrUrl) =>
                  typeof photoOrUrl === 'string' ? { url: photoOrUrl } : photoOrUrl,
                ),
              }}
              onAssistRequest={handleAssist}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/')}
              isSubmitting={isSubmitting}
              error={error}
              showAiOverview={true}
              submitLabel={selectedProfessionals.length > 0 ? 'Request Quotes' : 'Save Project'}
              showBudget={false}
              showService={true}
              showClientName={false}
              confirmationMode={true}
            />
          </div>
        )}
      </div>

      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-white/20 bg-slate-900/90 px-6 py-6 text-center text-white shadow-2xl">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-transparent" aria-hidden="true" />
            <p className="text-base font-semibold">
              {selectedProfessionals.length > 0 ? 'Requesting quotes...' : 'Saving project...'}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {selectedProfessionals.length > 0
                ? 'Inviting selected professionals and preparing your project dashboard.'
                : 'Preparing your project dashboard.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
