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

interface ProjectDescriptionData {
  title?: string;
  description: string;
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
      const storedDraft = sessionStorage.getItem('createProjectDraft');
      if (storedDraft) {
        try {
          const parsed = JSON.parse(storedDraft) as CreateProjectDraft;
          setInitialFormData(parsed.initialData || {});
          setSelectedProfessionals(
            Array.isArray(parsed.selectedProfessionals)
              ? filterProjectSelectableProfessionals(parsed.selectedProfessionals)
              : [],
          );
          if (parsed.aiIntakeId) {
            setAiIntakeId(parsed.aiIntakeId);
          }
        } catch (e) {
          console.warn('[create-project] Failed to parse createProjectDraft:', e);
        } finally {
          sessionStorage.removeItem('createProjectDraft');
        }
      }

      // Check if we have description data from sessionStorage (from projects list)
      const stored = sessionStorage.getItem('projectDescription');
      if (stored) {
        try {
          setDescriptionData(JSON.parse(stored));
          sessionStorage.removeItem('projectDescription');
        } catch (e) {
          console.warn('[create-project] Failed to parse sessionStorage data:', e);
        }
      }
      // Show description modal if no data stored
      if (!stored && !storedDraft) {
        setShowDescriptionModal(true);
      }
    }
  }, [hydrated, isLoggedIn]);

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" />;
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
      const uploadData = (await uploadRes.json()) as { urls: string[] };
      photoUrls = uploadData.urls;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
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

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/projects" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            {t('create.backLink')}
          </Link>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">{t('create.title')}</h1>
          <p className="text-lg text-slate-600">
              {t('create.description')}
          </p>
        </div>

        {/* Form Card */}
        {!showDescriptionModal && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-8">
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
