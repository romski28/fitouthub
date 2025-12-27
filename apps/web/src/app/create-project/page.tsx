'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

export default function CreateProjectPage() {
  const router = useRouter();
  const { isLoggedIn, accessToken, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    projectName: '',
    clientName: user?.firstName + ' ' + user?.surname || '',
    region: '',
    budget: '',
    notes: '',
  });

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/login');
    }
  }, [isLoggedIn, router]);

  if (isLoggedIn === undefined || isLoggedIn === false) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.projectName.trim() || !formData.region.trim()) {
      setError('Project name and region are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: formData.projectName,
          clientName: formData.clientName,
          region: formData.region,
          budget: formData.budget ? parseFloat(formData.budget) : null,
          notes: formData.notes,
          status: 'pending',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create project');
      }

      const project = await response.json();
      toast.success('Project created! Now invite professionals...');
      router.push(`/projects/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      setError(message);
      toast.error(message);
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Project Name *</label>
              <input
                type="text"
                required
                placeholder="e.g., Office Fitout, Restaurant Renovation"
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Client Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Your Name *</label>
              <input
                type="text"
                required
                placeholder="Your full name"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Region/Location *</label>
              <input
                type="text"
                required
                placeholder="e.g., Hong Kong Island, Kowloon"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Budget (HKD) <span className="text-slate-500 font-normal">(Optional)</span></label>
              <div className="relative">
                <span className="absolute left-4 top-2.5 text-slate-500 font-medium">$</span>
                <input
                  type="number"
                  placeholder="100,000"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  min="0"
                  step="1000"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pl-8 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Project Scope & Notes */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Project Scope & Details <span className="text-slate-500 font-normal">(Optional)</span></label>
              <textarea
                placeholder="Describe your project scope, requirements, timeline, and any specific needs. This helps professionals understand your project better."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={6}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-slate-500 mt-1">You can add photos and more details after creating the project.</p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.push('/projects')}
                className="flex-1 rounded-lg border border-slate-300 px-6 py-2.5 text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {isSubmitting ? 'Creating Project...' : 'Create Project'}
              </button>
            </div>
          </form>

          {/* Info Box */}
          <div className="mt-8 pt-8 border-t border-slate-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Next Step:</strong> After creating your project, you'll be able to search and invite professionals to submit quotes. We'll help you compare quotes, negotiate, and award the project.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
