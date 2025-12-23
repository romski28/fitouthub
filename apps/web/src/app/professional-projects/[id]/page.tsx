'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';

interface ProjectDetail {
  id: string;
  projectId: string;
  project: {
    id: string;
    projectName: string;
    clientName: string;
    region: string;
    budget?: string;
    notes?: string;
  };
  status: string;
  quoteAmount?: string;
  quoteNotes?: string;
  quotedAt?: string;
  respondedAt?: string;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectProfessionalId = params.id as string;

  const { isLoggedIn, accessToken } = useProfessionalAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    amount: '',
    notes: '',
  });

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/professional-login');
      return;
    }

    if (!isLoggedIn || !accessToken || !projectProfessionalId) {
      return;
    }

    const fetchProject = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/professional/projects/${projectProfessionalId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/professional-login');
            return;
          }
          throw new Error('Failed to fetch project');
        }

        const data = await response.json();
        setProject(data);

        // Pre-fill quote form if quote already exists
        if (data.quoteAmount) {
          setQuoteForm({
            amount: data.quoteAmount,
            notes: data.quoteNotes || '',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load project';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [isLoggedIn, accessToken, projectProfessionalId, router]);

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quoteForm.amount) {
      setError('Please enter a quote amount');
      return;
    }

    const amount = parseFloat(quoteForm.amount);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid quote amount');
      return;
    }

    setSubmittingQuote(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/quote`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            quoteAmount: amount,
            quoteNotes: quoteForm.notes,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit quote');
      }

      const result = await response.json();
      setProject(result.projectProfessional);
      setError(null);
      alert('Quote submitted successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit quote';
      setError(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleAccept = async () => {
    setSubmittingQuote(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/accept`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to accept project');
      }

      const result = await response.json();
      setProject(result.projectProfessional);
      alert('Project accepted!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept project';
      setError(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleReject = async () => {
    if (!window.confirm('Are you sure you want to reject this project?')) {
      return;
    }

    setSubmittingQuote(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/reject`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to reject project');
      }

      alert('Project rejected');
      router.push('/professional-projects');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject project';
      setError(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  if (isLoggedIn === undefined || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Project not found</p>
          <Link
            href="/professional-projects"
            className="mt-4 inline-block text-blue-600 hover:text-blue-700"
          >
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/professional-projects"
            className="text-blue-600 hover:text-blue-700 flex items-center mb-4"
          >
            ← Back to Projects
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            {project.project.projectName}
          </h1>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-8">
            <div className="text-sm font-medium text-red-800">{error}</div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          {/* Project Details */}
          <div className="p-8 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Project Details
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-sm text-gray-600">Client Name</p>
                <p className="text-lg font-semibold text-gray-900">
                  {project.project.clientName}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Location</p>
                <p className="text-lg font-semibold text-gray-900">
                  {project.project.region}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Project Budget</p>
                <p className="text-lg font-semibold text-gray-900">
                  {project.project.budget ? `$${project.project.budget}` : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${
                    project.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : project.status === 'accepted'
                      ? 'bg-green-100 text-green-800'
                      : project.status === 'quoted'
                      ? 'bg-blue-100 text-blue-800'
                      : project.status === 'awarded'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {project.status}
                </span>
              </div>
            </div>

            {project.project.notes && (
              <div>
                <p className="text-sm text-gray-600 mb-2">Project Notes</p>
                <p className="text-gray-900 bg-gray-50 p-4 rounded">
                  {project.project.notes}
                </p>
              </div>
            )}
          </div>

          {/* Quote Form */}
          {project.status === 'pending' || project.status === 'accepted' ? (
            <div className="p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Submit Your Quote
              </h2>

              <form onSubmit={handleSubmitQuote} className="space-y-6">
                <div>
                  <label
                    htmlFor="amount"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Quote Amount ($)
                  </label>
                  <input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                    value={quoteForm.amount}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, amount: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Quote Notes (Optional)
                  </label>
                  <textarea
                    id="notes"
                    rows={4}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Add any additional notes about your quote..."
                    value={quoteForm.notes}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, notes: e.target.value })
                    }
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={submittingQuote}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {submittingQuote ? 'Submitting...' : 'Submit Quote'}
                  </button>

                  {project.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={handleAccept}
                        disabled={submittingQuote}
                        className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
                      >
                        {submittingQuote ? 'Processing...' : 'Accept Project'}
                      </button>
                      <button
                        type="button"
                        onClick={handleReject}
                        disabled={submittingQuote}
                        className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 font-medium"
                      >
                        {submittingQuote ? 'Processing...' : 'Reject Project'}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          ) : (
            <div className="p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Your Quote
              </h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600">Quote Amount</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${project.quoteAmount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Submitted</p>
                  <p className="text-lg text-gray-900">
                    {project.quotedAt
                      ? new Date(project.quotedAt).toLocaleDateString()
                      : 'Not submitted'}
                  </p>
                </div>
              </div>
              {project.quoteNotes && (
                <div className="mt-6">
                  <p className="text-sm text-gray-600 mb-2">Notes</p>
                  <p className="text-gray-900 bg-gray-50 p-4 rounded">
                    {project.quoteNotes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
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
