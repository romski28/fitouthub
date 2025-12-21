'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ProfessionalProjectDetail from './professional-project-detail';
import { API_BASE_URL } from '@/config/api';
import { Project } from '@/lib/types';

export default function ProfessionalProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/projects/${id}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Project not found');
        }
        const data = await res.json();
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent"></div>
          <p className="mt-4 text-slate-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Project Not Found</h1>
          <p className="text-slate-600 mb-6">{error || "We couldn't find the project you're looking for."}</p>
          <a href="/" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Return Home
          </a>
        </div>
      </div>
    );
  }

  return <ProfessionalProjectDetail project={project} projectId={id} />;
}
