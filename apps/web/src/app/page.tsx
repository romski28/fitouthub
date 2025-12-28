'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { ModalOverlay } from '@/components/modal-overlay';
import { ProjectForm, ProjectFormData } from '@/components/project-form';
import { API_BASE_URL } from '@/config/api';

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const router = useRouter();
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProjectSubmit = async (data: ProjectFormData) => {
  const handleProjectSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const clientName = user ? `${user.firstName} ${user.surname}`.trim() : data.clientName;
      const locationLabel = [data.location?.primary, data.location?.secondary, data.location?.tertiary]
        .filter(Boolean)
        .join(", ");

      const payload = {
        projectName: data.projectName,
        tradesRequired: data.tradesRequired,
        clientName,
        region: locationLabel || data.region || "Hong Kong",
        budget: data.budget || undefined,
        notes: data.notes,
        status: "pending" as const,
        userId: user?.id,
      };

      const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create project");
      }

      setShowProjectModal(false);
      if (user?.id) {
        router.push(`/projects?clientId=${encodeURIComponent(user.id)}`);
      } else {
        router.push("/projects");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-16">
      {/* Search Flow */}
      <section className="relative -mx-6 -mt-10 bg-gradient-to-b from-emerald-50 to-white px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600 mb-2">
              Quick Start
            </p>
            <h2 className="text-2xl font-bold text-slate-900">
              Tell us what you need
            </h2>
          </div>
          <SearchFlow />
          
          {/* New Project Button - Only for logged-in users */}
          {isLoggedIn && (
            <div className="mt-6">
              <button
                onClick={() => setShowProjectModal(true)}
                className="w-full py-3 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 shadow-sm"
              >
                ...or start a new project here
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Content */}
          <div className="p-8 lg:p-12 space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-400 mb-2">
                Welcome to Fitout Hub
              </p>
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
                Find the Right Professionals for Your Fitout
              </h1>
            </div>
            <p className="text-lg text-slate-300">
              Connect with trusted contractors, companies, and resellers. Manage your renovation projects with ease and confidence.
            </p>
          </div>

          {/* Hero Image */}
          <div className="h-96 lg:h-full bg-contain bg-no-repeat bg-center hidden lg:flex items-center justify-center p-8" style={{
            backgroundImage: 'url("/hero-painter.png")'
          }} />
        </div>
      </section>

      {/* Features Section */}
      <InformationSection />

      {/* Project Creation Modal */}
      {showProjectModal && (
        <ModalOverlay isOpen={showProjectModal} onClose={() => setShowProjectModal(false)} maxWidth="max-w-3xl">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase font-semibold tracking-[0.12em] text-emerald-600">New project</p>
                <h2 className="text-2xl font-bold text-slate-900">Create Your Project</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Tell us about your project. You can invite professionals after creation.
                </p>
              </div>
            </div>

            <ProjectForm
              mode="create"
              onSubmit={handleProjectSubmit}
              onCancel={() => setShowProjectModal(false)}
              isSubmitting={isSubmitting}
              error={error}
              submitLabel="Create Project"
              showBudget={true}
              showService={true}
            />
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
