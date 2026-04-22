'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  isEmergency?: boolean;
  profession?: string;
  location?: CanonicalLocation;
  tradesRequired: string[];
}

interface AssistDraft {
  formData: ProjectFormData;
  pendingFiles: File[];
  removedPhotos: string[];
}

interface CreateProjectDraft {
  initialData?: Partial<ProjectFormData>;
  selectedProfessionals?: Professional[];
  aiIntakeId?: string;
}

const PROJECT_SELECTABLE_TYPES = new Set<Professional['professionType']>(['contractor', 'company']);

const filterProjectSelectableProfessionals = (professionals: Professional[]) => {
  return professionals.filter((professional) => PROJECT_SELECTABLE_TYPES.has(professional.professionType));
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
  const [selectedProfessionals, setSelectedProfessionals] = useState<Professional[]>([]);
  const [aiIntakeId, setAiIntakeId] = useState<string | null>(null);

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
          }
        : null;

      if (mergedDraft) {
        setInitialFormData(mergedDraft.initialData || {});
        setSelectedProfessionals(
          Array.isArray(mergedDraft.selectedProfessionals)
            ? filterProjectSelectableProfessionals(mergedDraft.selectedProfessionals)
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
          parsedDescriptionForDebug = parsedDescription;
          setDescriptionData(parsedDescription);
          sessionStorage.removeItem('projectDescription');
        } catch (e) {
          console.warn('[create-project] Failed to parse sessionStorage data:', e);
        }
      }

      if (!stored) {
        const memoryDescription = getProjectDescriptionHandoff();
        if (memoryDescription) {
          parsedDescriptionForDebug = {
            description: memoryDescription.description || '',
            title: memoryDescription.title,
            isEmergency: memoryDescription.isEmergency,
            profession: memoryDescription.profession,
            location: memoryDescription.location,
            tradesRequired: memoryDescription.tradesRequired || [],
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

      // Show description modal if no data stored
      if (!stored && !storedDraft && !parsedDraftForDebug && !parsedDescriptionForDebug) {
        setShowDescriptionModal(true);
      }
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

  const buildProjectPayload = (formData: ProjectFormData, photoUrls: string[], professionalIds: string[] = []) => {
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

    return {
      projectName: formData.projectName,
      clientName: formData.clientName,
      region,
      budget: formData.budget ? parseFloat(String(formData.budget)) : null,
      notes: formData.notes,
      status: 'pending',
      professionalIds,
      userId: user?.id,
      tradesRequired: formData.tradesRequired || [],
      onlySelectedProfessionalsCanBid: formData.onlySelectedProfessionalsCanBid ?? true,
      photos: photoUrls.length > 0 ? photoUrls.map((url) => ({ url })) : [],
      userPrompt: descriptionData?.description || null,
      aiIntakeId: aiIntakeId || null,
      endDate: formData.endDate || null,
      isEmergency: formData.isEmergency ?? false,
    };
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
      const photoUrls = await uploadPendingFiles(pendingFiles);
      const payload = buildProjectPayload(
        formData,
        photoUrls,
        selectedProfessionals.map((professional) => professional.id),
      );

      console.log('[create-project] Submitting payload:', payload);

      const project = await createProject(payload);
      console.log('[create-project] Project created successfully:', project);
      toast.success(
        selectedProfessionals.length > 0
          ? 'Project created and bidding is now open to your selected professionals.'
          : 'Project saved. You can open bidding when you are ready.',
      );
      router.push(`/projects/${project.id}`);
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

  const submitAssistRequest = async (assistConfig: AssistRequestModalSubmit) => {
    if (!assistDraft) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const photoUrls = await uploadPendingFiles(assistDraft.pendingFiles);
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
          ? 'Project created and call request sent to Fitout Hub.'
          : assistConfig.contactMethod === 'whatsapp'
            ? 'Project created and WhatsApp request sent to Fitout Hub.'
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
  const tradeSummary = initialFormData.tradesRequired?.length
    ? initialFormData.tradesRequired.join(', ')
    : descriptionData?.tradesRequired?.length
      ? descriptionData.tradesRequired.join(', ')
      : 'General project';
  const emergencySummary = initialFormData.isEmergency ?? descriptionData?.isEmergency;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
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

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            {t('create.backLink')}
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-sm">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Project creation</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{initialFormData.projectName || descriptionData?.title || 'New Project'}</h1>
              <p className="max-w-2xl text-sm text-slate-300 sm:text-base">Please confirm your project's details and add images.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px] lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Invited pros</p>
                <p className="mt-1 text-2xl font-bold text-white">{invitedCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trade focus</p>
                <p className="mt-1 text-sm font-semibold text-white">{tradeSummary}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Priority</p>
                <p className="mt-1 text-sm font-semibold text-white">{emergencySummary ? 'Emergency' : 'Standard'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-5 text-white shadow-lg shadow-emerald-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Bidding recipients</p>
              <h2 className="text-xl font-bold text-white">
                {invitedCount > 0
                  ? `${invitedCount} selected professional${invitedCount === 1 ? '' : 's'} will be invited when you submit`
                  : 'No professionals selected yet'}
              </h2>
              <p className="max-w-2xl text-sm text-slate-200">
                {invitedCount > 0
                  ? 'These professionals will be linked to the project immediately and bidding will open as soon as you confirm the final form.'
                  : 'This project will be saved without invitations. You can still invite professionals later from the project list or details page.'}
              </p>
            </div>

            {invitedCount > 0 ? (
              <div className="flex max-w-2xl flex-wrap gap-2 lg:justify-end">
                {selectedProfessionalNames.map((name, index) => (
                  <span
                    key={`${name}-${index}`}
                    className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-sm font-medium text-emerald-100"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {!showDescriptionModal && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 shadow-xl shadow-slate-950/30">
            <div className="border-b border-slate-700/70 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Review project brief</h2>
              <p className="mt-1 text-sm text-slate-300">
                Confirm the AI brief and invited professionals before opening bidding.
              </p>
            </div>

            <ProjectForm
              mode="create"
              key={JSON.stringify({
                descriptionData,
                initialFormData,
                selectedProfessionalIds: selectedProfessionals.map((professional) => professional.id),
              })}
              professionals={selectedProfessionals}
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
              }}
              onAssistRequest={handleAssist}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/')}
              isSubmitting={isSubmitting}
              error={error}
              showAiOverview={true}
              submitLabel={selectedProfessionals.length > 0 ? 'Open Bidding' : 'Save Project'}
              showBudget={false}
              showService={true}
              showClientName={false}
              confirmationMode={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
