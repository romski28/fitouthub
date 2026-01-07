'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import ProjectChat from '@/components/project-chat';
import ProjectFinancialsCard from '@/components/project-financials-card';
import ProjectInfoCard from '@/components/project-info-card';

interface ProjectDetail {
  id: string;
  projectId: string;
  professionalId?: string;
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
  invoice?: {
    id: string;
    amount: string;
    paymentStatus: string;
    paidAt?: string;
  };
  advancePaymentRequest?: {
    id: string;
    requestType: string;
    requestAmount: string;
    requestPercentage?: number;
    status: string;
    createdAt: string;
  };
}

interface Message {
  id: string;
  projectProfessionalId: string;
  senderType: 'professional' | 'client' | string;
  content: string;
  createdAt: string;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [showAdvanceRequestForm, setShowAdvanceRequestForm] = useState(false);
  const [advanceRequestForm, setAdvanceRequestForm] = useState({
    requestType: 'fixed' as 'fixed' | 'percentage',
    amount: '',
    percentage: '',
  });
  const [submittingAdvanceRequest, setSubmittingAdvanceRequest] = useState(false);

  // Scroll to top on page load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
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
    // Fetch messages and mark client messages as read
    const fetchMessages = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/professional/projects/${projectProfessionalId}/messages`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          // mark read
          await fetch(
            `${API_BASE_URL}/professional/projects/${projectProfessionalId}/messages/mark-read`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );
        } else if (res.status === 404) {
          setMessageError('Messaging is not available for this project right now.');
        } else if (res.status === 401) {
          router.push('/');
          return;
        }
      } catch (e) {
        setMessageError('Failed to load messages. Please try again later.');
      }
    };

    if (accessToken) {
      fetchMessages();
    }
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
      // Check if this is an update to an existing quote (counter-request scenario)
      const isUpdate = project?.quotedAt && project.status === 'counter_requested';
      
      let response;
      if (isUpdate) {
        // Use update-quote endpoint
        response = await fetch(
          `${API_BASE_URL}/projects/${project.project.id}/update-quote`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              professionalId: project.professionalId || project.projectId /* fallback to projectProfessionalId is incorrect but kept to avoid undefined */,
              quoteAmount: amount,
              quoteNotes: quoteForm.notes,
            }),
          },
        );
      } else {
        // Initial quote submission
        response = await fetch(
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
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit quote');
      }

      const result = await response.json();
      // Merge updated fields into existing project to preserve nested project object
      if (isUpdate && result.projectProfessional) {
        setProject((prev) => prev ? { ...prev, ...result.projectProfessional } : result.projectProfessional);
      } else {
        setProject(result.projectProfessional);
      }
      setError(null);
      setQuoteForm({ amount: '', notes: '' }); // Clear form
      toast.success(isUpdate ? 'Quote updated successfully!' : 'Quote submitted successfully!');
      
      // Refresh messages to show the auto-generated message
      const msgRes = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/messages`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit quote';
      setError(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleKeepCurrentQuote = async () => {
    if (!project || !accessToken) return;
    const currentAmount = project.quoteAmount ? parseFloat(project.quoteAmount) : NaN;
    if (isNaN(currentAmount)) {
      setError('No existing quote amount found to keep. Please enter a new quote.');
      return;
    }

    setSubmittingQuote(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${project.project.id}/update-quote`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            professionalId: project.professionalId || project.projectId,
            quoteAmount: currentAmount,
            quoteNotes: (quoteForm.notes && quoteForm.notes.trim().length > 0)
              ? quoteForm.notes
              : (project.quoteNotes || 'No change to current offer'),
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to keep current quote');
      }

      const result = await response.json();
      // Merge updated fields into existing project to preserve nested project object
      setProject((prev) => prev ? { ...prev, ...result.projectProfessional } : result.projectProfessional);
      setError(null);
      toast.success('Quotation confirmed. The client will review it.');
      
      // Refresh messages
      const msgRes = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/messages`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to keep current quote';
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
      toast.success('Project accepted!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept project';
      setError(message);
      toast.error(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  // Show upfront costs prompt only once when the project becomes awarded
  // REMOVED: Now handled by advance payment request form in detail card

  const handleReject = async () => {
    const confirmed = await new Promise<boolean>((resolve) => {
      toast((t) => (
        <div className="space-y-3">
          <p className="font-medium text-slate-900">Reject this project?</p>
          <p className="text-sm text-slate-600">This action cannot be undone.</p>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"
            >
              Reject
            </button>
          </div>
        </div>
      ));
    });

    if (!confirmed) {
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

      toast.success('Project rejected');
      router.push('/professional-projects');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject project';
      setError(message);
      toast.error(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleSubmitAdvanceRequest = async () => {
    if (!accessToken || !projectProfessionalId) return;

    // Validate form
    if (advanceRequestForm.requestType === 'fixed') {
      const amount = parseFloat(advanceRequestForm.amount);
      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }
    } else {
      const percentage = parseFloat(advanceRequestForm.percentage);
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        toast.error('Please enter a valid percentage (1-100)');
        return;
      }
    }

    setSubmittingAdvanceRequest(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/advance-payment-request`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestType: advanceRequestForm.requestType,
            amount: advanceRequestForm.requestType === 'fixed' 
              ? parseFloat(advanceRequestForm.amount) 
              : undefined,
            percentage: advanceRequestForm.requestType === 'percentage' 
              ? parseFloat(advanceRequestForm.percentage) 
              : undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit advance payment request');
      }

      toast.success('Advance payment request submitted! Client will be notified.');
      setShowAdvanceRequestForm(false);
      setAdvanceRequestForm({ requestType: 'fixed', amount: '', percentage: '' });
      
      // Refresh project data
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit request';
      toast.error(message);
    } finally {
      setSubmittingAdvanceRequest(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    setMessageError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: newMessage.trim() }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setMessages((msgs) => [...msgs, data.message]);
        setNewMessage('');
      } else if (res.status === 404) {
        setMessageError('Messaging endpoint not found. Please refresh after we deploy the update.');
      } else if (res.status === 401) {
        router.push('/');
        return;
      } else {
        const data = await res.json().catch(() => ({}));
        setMessageError(data?.message || 'Failed to send message.');
      }
    } catch {
      setMessageError('Network error while sending message.');
    }
    finally {
      setSending(false);
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
      <>
      <Toaster position="top-right" />
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
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-slate-50 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          <div className="flex items-center justify-between">
            <Link href="/professional-projects" className="text-sm text-blue-600 hover:underline">
              ← Back to my projects
            </Link>
          </div>

          {/* Unified Top Project Info */}
          <ProjectInfoCard
            role="professional"
            title={project!.project.projectName}
            region={project!.project.region}
            status={project!.status}
            notes={project!.project.notes || undefined}
          />

          {/* Quote Form */}
          {['pending', 'accepted', 'counter_requested', 'quoted'].includes(project.status) && !(project.status === 'declined' || project.status === 'rejected') ? (
            <div className="p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                {project.quotedAt ? 'Update Your Quote' : 'Submit Your Quote'}
              </h2>

              {project.status === 'counter_requested' ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  The client requested a better offer. You can submit a revised quote or keep your current offer.
                </div>
              ) : project.status === 'quoted' ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                  You can adjust your quote if needed. Submit a revised amount or keep your current offer.
                </div>
              ) : null}

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

                <div className="flex gap-4 flex-wrap">
                  <button
                    type="submit"
                    disabled={submittingQuote}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {submittingQuote ? 'Submitting...' : project.quotedAt ? 'Update Quote' : 'Submit Quote'}
                  </button>

                  {project.status === 'counter_requested' && (
                    <button
                      type="button"
                      onClick={handleKeepCurrentQuote}
                      disabled={submittingQuote}
                      className="flex-1 bg-slate-600 text-white py-2 px-4 rounded-md hover:bg-slate-700 disabled:opacity-50 font-medium"
                    >
                      {submittingQuote ? 'Processing...' : 'Confirm Quotation'}
                    </button>
                  )}

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
          ) : !(project.status === 'declined' || project.status === 'rejected') ? (
            <div className="p-8 border-t border-gray-200">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Your Quote</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Amount</p>
                      <p className="text-xl font-bold text-slate-900">
                        ${project.quoteAmount}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Submitted</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {project.quotedAt
                          ? new Date(project.quotedAt).toLocaleDateString()
                          : 'Not submitted'}
                      </p>
                    </div>
                  </div>
                  {project.quoteNotes && (
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-sm text-slate-600 mb-2">Notes</p>
                      <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded">
                        {project.quoteNotes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Invoice & Advance Payment (shown when awarded) */}
          {project.status === 'awarded' && (
            <div className="p-8 border-t border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                💰 Invoice & Payment
              </h2>

              {project.invoice && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-gray-600">Invoice Status</p>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${project.invoice.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {project.invoice.paymentStatus === 'paid' ? '✓ Paid' : 'Pending Payment'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">Invoice Amount</p>
                      <p className="text-2xl font-bold text-gray-900">${Number(project.invoice.amount).toFixed(2)}</p>
                    </div>
                    {project.invoice.paidAt && (
                      <div>
                        <p className="text-sm text-gray-600">Paid On</p>
                        <p className="text-lg text-gray-900">{new Date(project.invoice.paidAt).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                  {project.invoice.paymentStatus === 'paid' && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <p className="text-sm text-green-900">
                        ✓ <strong>Payment Received!</strong> Funds are securely held in Fitout Hub's escrow account and will be released according to project milestones.
                      </p>
                    </div>
                  )}
                  {project.invoice.paymentStatus !== 'paid' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-sm text-yellow-900">
                        ⏳ Waiting for client payment. You'll be notified when funds are deposited into escrow.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Advance Payment Request Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Advance Payment</h3>
                
                {project.advancePaymentRequest ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-blue-900">Advance Payment Request</p>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          project.advancePaymentRequest.status === 'approved' 
                            ? 'bg-green-100 text-green-800' 
                            : project.advancePaymentRequest.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {project.advancePaymentRequest.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-blue-700 font-medium">Amount Requested</p>
                          <p className="text-blue-900 font-semibold">${Number(project.advancePaymentRequest.requestAmount).toFixed(2)}</p>
                        </div>
                        {project.advancePaymentRequest.requestType === 'percentage' && (
                          <div>
                            <p className="text-blue-700 font-medium">Percentage</p>
                            <p className="text-blue-900 font-semibold">{project.advancePaymentRequest.requestPercentage}%</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-blue-700 mt-3">
                        Submitted {new Date(project.advancePaymentRequest.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {!showAdvanceRequestForm ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                          Request upfront payment for materials, tools, or other costs before starting the project.
                        </p>
                        <button
                          onClick={() => setShowAdvanceRequestForm(true)}
                          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium transition-colors"
                        >
                          📋 Submit Advance Payment Request
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex gap-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="requestType"
                              value="fixed"
                              checked={advanceRequestForm.requestType === 'fixed'}
                              onChange={(e) => setAdvanceRequestForm({ ...advanceRequestForm, requestType: e.target.value as 'fixed' })}
                              className="mr-2"
                            />
                            <span className="text-sm font-medium text-gray-700">Fixed Amount</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="requestType"
                              value="percentage"
                              checked={advanceRequestForm.requestType === 'percentage'}
                              onChange={(e) => setAdvanceRequestForm({ ...advanceRequestForm, requestType: e.target.value as 'percentage' })}
                              className="mr-2"
                            />
                            <span className="text-sm font-medium text-gray-700">Percentage</span>
                          </label>
                        </div>

                        {advanceRequestForm.requestType === 'fixed' ? (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Amount ($)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={advanceRequestForm.amount}
                              onChange={(e) => setAdvanceRequestForm({ ...advanceRequestForm, amount: e.target.value })}
                              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              placeholder="0.00"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Percentage (%)
                            </label>
                            <input
                              type="number"
                              step="1"
                              min="1"
                              max="100"
                              value={advanceRequestForm.percentage}
                              onChange={(e) => setAdvanceRequestForm({ ...advanceRequestForm, percentage: e.target.value })}
                              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              placeholder="50"
                            />
                          </div>
                        )}

                        <div className="flex gap-3">
                          <button
                            onClick={handleSubmitAdvanceRequest}
                            disabled={submittingAdvanceRequest}
                            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
                          >
                            {submittingAdvanceRequest ? 'Submitting...' : 'Submit Request'}
                          </button>
                          <button
                            onClick={() => {
                              setShowAdvanceRequestForm(false);
                              setAdvanceRequestForm({ requestType: 'fixed', amount: '', percentage: '' });
                            }}
                            className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Project Financials */}
          {project.status === 'awarded' && project.quoteAmount && accessToken && (
            <div className="p-8 border-t border-gray-200">
              <ProjectFinancialsCard
                projectProfessionalId={project.id}
                projectId={project.project.id}
                accessToken={accessToken}
                projectCost={project.quoteAmount}
                role="professional"
              />
            </div>
          )}

          {/* Messages */}
          <div className="p-8 border-t border-gray-200">
            {project.status === 'awarded' ? (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Team Chat</h2>
                <ProjectChat 
                  projectId={project.project.id} 
                  accessToken={accessToken || ''} 
                  currentUserRole="professional"
                />
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Messages</h2>
                {messageError && (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {messageError}
                  </div>
                )}
                <div className="max-h-96 overflow-y-auto bg-gray-50 p-4 rounded">
                  {messages.length === 0 ? (
                    <p className="text-gray-500 text-sm">No messages yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {messages.map((m) => (
                        <li key={m.id} className={`flex ${m.senderType==='professional' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`inline-block px-3 py-2 rounded-lg text-sm ${m.senderType==='professional' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                            <p>{m.content}</p>
                            <p className="mt-1 text-xs opacity-70">{new Date(m.createdAt).toLocaleString()}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <form onSubmit={handleSendMessage} className="mt-4 flex gap-3">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <Toaster position="top-right" />
    </>
  );
}
