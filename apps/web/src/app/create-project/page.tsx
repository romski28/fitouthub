'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';
import { ProjectForm } from '@/components/project-form';
import type { ProjectFormData } from '@/components/project-form';

export default function CreateProjectPage() {
  const router = useRouter();
  const { isLoggedIn, accessToken, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  if (isLoggedIn === undefined || isLoggedIn === false) {
    return null;
  }

  const handleSubmit = async (formData: ProjectFormData) => {
    setError(null);

    // Derive region from location object
    const region = formData.location 
      ? [formData.location.primary, formData.location.secondary, formData.location.tertiary]
          .filter(Boolean)
          .join(", ")
      : formData.region || '';

    if (!formData.projectName?.trim() || !region.trim()) {
      setError('Project name and region are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        projectName: formData.projectName,
        clientName: formData.clientName,
        region: region,
        budget: formData.budget ? parseFloat(String(formData.budget)) : null,
        notes: formData.notes,
        status: 'pending',
        professionalIds: [],
        userId: user?.id,
      };

      console.log('[create-project] Submitting payload:', payload);

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

      const project = await response.json();
      console.log('[create-project] Project created successfully:', project);
      toast.success('Project created! Now invite professionals...');
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

  const handleAssist = async (formData: ProjectFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const region = formData.location 
        ? [formData.location.primary, formData.location.secondary, formData.location.tertiary]
            .filter(Boolean)
            .join(", ")
        : formData.region || '';

      if (!formData.projectName?.trim() || !region.trim()) {
        setError('Project name and region are required');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        projectName: formData.projectName,
        clientName: formData.clientName,
        region,
        budget: formData.budget ? parseFloat(String(formData.budget)) : null,
        notes: formData.notes,
        status: 'pending',
        professionalIds: [],
        userId: user?.id,
      };

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
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      const project = await response.json();

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
          notes: payload.notes,
        }),
      });

      if (!assistRes.ok) {
        const data = await assistRes.json().catch(() => ({ message: 'Failed to request assistance' }));
        throw new Error(data.message || `Server error: ${assistRes.status}`);
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request assistance';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/projects" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            ← Back to Projects
          </Link>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Create a New Project</h1>
          <p className="text-lg text-slate-600">
            Describe your fitout project and scope before inviting professionals to submit quotes.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-8">
          <ProjectForm
            mode="create"
            initialData={{
              clientName: user?.firstName && user?.surname ? `${user.firstName} ${user.surname}` : '',
            }}
            onAssistRequest={handleAssist}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/projects')}
            isSubmitting={isSubmitting}
            error={error}
            submitLabel="Create Project"
            showBudget={true}
            showService={false}
          />
        </div>
      </div>
    </div>
  );
}
