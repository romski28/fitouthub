'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import { Project } from '@/lib/types';
import { useSearchParams } from 'next/navigation';

interface ProfessionalProjectDetailProps {
  project: Project;
  projectId: string;
}

export default function ProfessionalProjectDetail({ project, projectId }: ProfessionalProjectDetailProps) {
  const searchParams = useSearchParams();
  const professionalId = searchParams.get('pro');
  
  const [quoteAmount, setQuoteAmount] = useState<string>('');
  const [quoteNotes, setQuoteNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!professionalId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Access</h1>
          <p className="text-slate-600 mb-6">We couldn't identify your professional profile. Please use the link from the project invitation email.</p>
          <a href="/" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Return Home
          </a>
        </div>
      </div>
    );
  }

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!quoteAmount || parseFloat(quoteAmount) <= 0) {
        throw new Error('Please enter a valid quote amount');
      }

      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/projects/${projectId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId,
          quoteAmount: parseFloat(quoteAmount),
          quoteNotes: quoteNotes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Failed to submit quote' }));
        throw new Error(data.message || 'Failed to submit quote');
      }

      setSuccess(true);
      setQuoteAmount('');
      setQuoteNotes('');

      // Auto-redirect after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Project Details */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-6">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white">
            <h1 className="text-3xl font-bold mb-2">{project.projectName}</h1>
            <p className="text-sm text-slate-300">Project ID: {projectId}</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Client</p>
                <p className="text-lg font-medium text-slate-900">{project.clientName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Region</p>
                <p className="text-lg font-medium text-slate-900">{project.region}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Budget</p>
                <p className="text-lg font-medium text-slate-900">
                  {project.budget ? `HKD ${Number(project.budget).toLocaleString()}` : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</p>
                <p className="text-lg font-medium text-slate-900 capitalize">{project.status}</p>
              </div>
            </div>

            {project.notes && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Project Details</p>
                <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-lg">{project.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Quote Submission Form */}
        {!success ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Submit Your Quote</h2>
              <p className="text-sm text-slate-600 mt-1">Provide your quote amount and any additional notes for the client.</p>
            </div>

            <form onSubmit={handleSubmitQuote} className="p-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="quoteAmount" className="block text-sm font-medium text-slate-800 mb-1.5">
                    Quote Amount (HKD) *
                  </label>
                  <input
                    id="quoteAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 5000"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="quoteNotes" className="block text-sm font-medium text-slate-800 mb-1.5">
                  Additional Notes (Optional)
                </label>
                <textarea
                  id="quoteNotes"
                  placeholder="e.g. Breakdown of costs, timeline, special considerations..."
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  disabled={loading}
                  rows={5}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-400 transition"
              >
                {loading ? 'Submitting...' : 'Submit Quote'}
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <h2 className="text-2xl font-bold text-emerald-900 mb-2">✅ Quote Submitted!</h2>
            <p className="text-emerald-700 mb-4">Your quote has been successfully submitted to the client.</p>
            <p className="text-sm text-emerald-600">Redirecting you home...</p>
          </div>
        )}
      </div>
    </div>
  );
}
