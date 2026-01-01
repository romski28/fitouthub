'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';
import toast, { Toaster } from 'react-hot-toast';

interface ProjectProfessional {
  id: string;
  professionalId: string;
  projectId: string;
  status: string;
  quoteAmount?: string | number;
  quoteNotes?: string;
  quotedAt?: string;
  professional: {
    id: string;
    email: string;
    fullName?: string;
    businessName?: string;
    phone?: string;
  };
  invoice?: {
    id: string;
    amount: string;
    paymentStatus: string;
    paidAt?: string;
  };
}

interface ProjectDetail {
  id: string;
  projectName: string;
  region: string;
  budget?: string;
  notes?: string;
  professionals?: ProjectProfessional[];
  startDate?: string;
  endDate?: string;
  contractorContactName?: string;
  contractorContactPhone?: string;
  contractorContactEmail?: string;
}

interface Message {
  id: string;
  projectProfessionalId: string;
  senderType: 'professional' | 'client' | string;
  content: string;
  createdAt: string;
}

const projectStatusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  withdrawn: 'bg-slate-200 text-slate-800',
};

export default function ClientProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const { isLoggedIn, accessToken } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Messaging state
  const [selectedProfessional, setSelectedProfessional] = useState<ProjectProfessional | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [awardedProfessional, setAwardedProfessional] = useState<ProjectProfessional | null>(null);
  const [sharedContact, setSharedContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [payingInvoice, setPayingInvoice] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Schedule & contractor contact editing state
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ startDate: '', endDate: '' });
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '' });
  const [updatingSchedule, setUpdatingSchedule] = useState(false);
  const [updatingContact, setUpdatingContact] = useState(false);

  // Assistance (FOH) state
  const [assistRequestId, setAssistRequestId] = useState<string | null>(null);
  const [assistMessages, setAssistMessages] = useState<Message[]>([]);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistNewMessage, setAssistNewMessage] = useState('');
  const [assistSending, setAssistSending] = useState(false);

  // Helper: fetch project details (reusable)
  const fetchProject = async () => {
    if (!accessToken || !projectId) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch project');
      }

      const data = await response.json();
      setProject(data);

      // Auto-select first professional if available
      if (data.professionals && data.professionals.length > 0) {
        setSelectedProfessional(data.professionals[0]);
      } else {
        setSelectedProfessional(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/login');
      return;
    }

    if (!isLoggedIn || !accessToken || !projectId) {
      return;
    }

    fetchProject();
  }, [isLoggedIn, accessToken, projectId, router]);

  // Fetch messages when professional is selected
  useEffect(() => {
    if (!selectedProfessional || !accessToken) return;

    const fetchMessages = async () => {
      try {
        setLoadingMessages(true);
        setMessageError(null);
        const res = await fetch(
          `${API_BASE_URL}/client/projects/${selectedProfessional.id}/messages`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (res.status === 404) {
          setMessageError('Messaging is not available for this project right now.');
          setMessages([]);
          return;
        }

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        if (!res.ok) {
          throw new Error('Failed to fetch messages');
        }

        const data = await res.json();
        setMessages(data.messages || []);

        // Mark messages as read
        await fetch(
          `${API_BASE_URL}/client/projects/${selectedProfessional.id}/messages/mark-read`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
      } catch (err) {
        console.error('Error fetching messages:', err);
        setMessageError('Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [selectedProfessional, accessToken, router]);

  // Load FOH assistance thread for this project
  useEffect(() => {
    const loadAssist = async () => {
      if (!accessToken || !projectId) return;
      try {
        setAssistLoading(true);
        setAssistError(null);
        const res = await fetch(`${API_BASE_URL}/assist-requests/by-project/${encodeURIComponent(projectId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 404) {
          setAssistRequestId(null);
          setAssistMessages([]);
          return;
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Failed to load assistance');
        }
        const data = await res.json();
        const assist = data?.assist;
        if (assist?.id) {
          setAssistRequestId(assist.id);
          // Fetch messages
          const mres = await fetch(`${API_BASE_URL}/assist-requests/${encodeURIComponent(assist.id)}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (mres.ok) {
            const msgs = await mres.json();
            const normalized = Array.isArray(msgs) ? msgs : (msgs.messages || []);
            // Map to Message shape
            const mapped: Message[] = normalized.map((m: any) => ({
              id: m.id,
              projectProfessionalId: '',
              senderType: (m.senderType as any) || 'foh',
              content: m.content,
              createdAt: m.createdAt,
            }));
            setAssistMessages(mapped);
          } else {
            setAssistMessages([]);
          }
        } else {
          setAssistRequestId(null);
          setAssistMessages([]);
        }
      } catch (err) {
        console.error('[Assist] load failed', err);
        setAssistError('Failed to load assistance messages');
      } finally {
        setAssistLoading(false);
      }
    };
    loadAssist();
  }, [accessToken, projectId]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedProfessional || !accessToken) return;

    try {
      setSending(true);
      setMessageError(null);
      const res = await fetch(
        `${API_BASE_URL}/client/projects/${selectedProfessional.id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: newMessage.trim() }),
        },
      );

      if (res.status === 404) {
        setMessageError('Messaging is not available for this project right now.');
        return;
      }

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      setMessageError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const actOnQuote = async (kind: 'accept' | 'reject' | 'request-better') => {
    if (!selectedProfessional || !accessToken) return;
    try {
      setActionBusy(kind);
      
      if (kind === 'accept') {
        // Award the quote via new endpoint
        const res = await fetch(
          `${API_BASE_URL}/projects/${projectId}/award/${selectedProfessional.professionalId}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) throw new Error('Award failed');
        
        toast.success('Quote accepted! Project awarded to professional.');
        
        // Show contact sharing modal
        setAwardedProfessional(selectedProfessional);
        setShowContactModal(true);
        
        // Update local state
        setSelectedProfessional((prev) => (prev ? { ...prev, status: 'awarded' } : prev));
      } else {
        // Reject or counter-request
        let res;
        if (kind === 'request-better') {
          // Use new counter-request endpoint
          res = await fetch(
            `${API_BASE_URL}/projects/${projectId}/counter-request/${selectedProfessional.professionalId}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            },
          );
        } else {
          // Reject
          res = await fetch(
            `${API_BASE_URL}/client/projects/${selectedProfessional.id}/quote/reject`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
        }
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) throw new Error('Action failed');
        const data = await res.json();
        
        if (kind === 'reject') {
          toast.success('Quote declined.');
        } else {
          toast.success('Requested better quote.');
        }
        
        setSelectedProfessional((prev) => (prev ? { ...prev, status: kind === 'request-better' ? 'counter_requested' : (data.projectProfessional?.status || prev.status) } : prev));
      }
      
      // Refresh messages to capture auto-generated message
      const listRes = await fetch(
        `${API_BASE_URL}/client/projects/${selectedProfessional.id}/messages`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (listRes.ok) {
        const list = await listRes.json();
        setMessages(list.messages || []);
      }
    } catch (e) {
      console.error('Action failed', e);
      toast.error('Failed to process quote action. Please try again.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleShareContact = async () => {
    if (!awardedProfessional || !accessToken) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/${projectId}/share-contact/${awardedProfessional.professionalId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) throw new Error('Failed to share contact');
      const data = await res.json();
      setSharedContact(data.professional);
      toast.success('Contact details shared!');
    } catch (e) {
      console.error('Contact sharing failed', e);
      toast.error('Failed to share contact details.');
    }
  };

  const handleContinueOnPlatform = () => {
    toast.success('Continuing via platform. You can message the professional below.');
    setShowContactModal(false);
  };

  const handleScheduleSave = async () => {
    if (!scheduleForm.startDate && !scheduleForm.endDate) {
      toast.error('Please enter at least a start or end date');
      return;
    }

    setUpdatingSchedule(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/schedule`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: scheduleForm.startDate || undefined,
          endDate: scheduleForm.endDate || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to update schedule');
      const data = await res.json();
      setProject((prev) => prev ? { ...prev, ...data.project } : null);
      setEditingSchedule(false);
      toast.success('Schedule updated!');
    } catch (e) {
      console.error('Schedule update failed', e);
      toast.error('Failed to update schedule.');
    } finally {
      setUpdatingSchedule(false);
    }
  };

  const handleContactSave = async () => {
    if (!contactForm.name && !contactForm.phone && !contactForm.email) {
      toast.error('Please enter at least one contact detail');
      return;
    }

    setUpdatingContact(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/contractor-contact`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: contactForm.name || undefined,
          phone: contactForm.phone || undefined,
          email: contactForm.email || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to update contact');
      const data = await res.json();
      setProject((prev) => prev ? { ...prev, ...data.project } : null);
      setEditingContact(false);
      toast.success('Contractor contact updated!');
    } catch (e) {
      console.error('Contact update failed', e);
      toast.error('Failed to update contractor contact.');
    } finally {
      setUpdatingContact(false);
    }
  };

  const handlePayInvoice = async () => {
    if (!accessToken || !projectId) return;

    const confirmed = window.confirm(
      'Are you ready to pay the invoice? The funds will be held in escrow by Fitout Hub until the project is completed.'
    );

    if (!confirmed) return;

    setPayingInvoice(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pay-invoice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Payment failed');
      }

      toast.success('Payment successful! Funds deposited into escrow.');
      
      // Refresh project to update invoice status
      await fetchProject();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process payment';
      toast.error(message);
      console.error('Payment error:', err);
    } finally {
      setPayingInvoice(false);
    }
  };

  const handleWithdrawProject = async () => {
    if (!accessToken || !projectId) return;

    const confirmed = window.confirm(
      'Withdraw this project from bidding? Invited professionals will be notified.',
    );
    if (!confirmed) return;

    setWithdrawing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/withdraw`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to withdraw project');
      }

      toast.success('Project withdrawn from bidding.');
      await fetchProject();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to withdraw project';
      toast.error(message);
    } finally {
      setWithdrawing(false);
    }
  };

  // One-click invite for 'selected' professionals
  const inviteNow = async (pp: ProjectProfessional) => {
    if (!pp || !accessToken || !projectId) return;

    // Require minimal project info
    const hasTitle = !!project?.projectName && project.projectName.trim().length > 0;
    const hasRegion = !!project?.region && project.region.trim().length > 0;
    if (!hasTitle || !hasRegion) {
      toast.error('Please add a project title and location before inviting professionals.');
      return;
    }

    try {
      setActionBusy(`invite-${pp.professionalId}`);
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ professionalIds: [pp.professionalId] }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to send invitation');
      }

      toast.success('Invitation sent to professional.');

      // Refresh project to update statuses
      await fetchProject();
    } catch (e) {
      console.error('Invite failed', e);
      toast.error('Failed to send invitation. Please try again.');
    } finally {
      setActionBusy(null);
    }
  };

  if (loading || isLoggedIn === undefined) {
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

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="rounded-lg bg-red-50 border border-red-200 p-6 max-w-md w-full text-center">
          <p className="text-red-800 font-medium">{error || 'Project not found'}</p>
          <Link href="/projects" className="mt-4 inline-block text-blue-600 hover:underline">
            ← Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-slate-50 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href="/projects" className="text-sm text-blue-600 hover:underline">
              ← Back to projects
            </Link>
          </div>

        {/* Project Info */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white rounded-t-xl">
            <h1 className="text-2xl font-bold">{project.projectName}</h1>
            <p className="text-sm text-emerald-300 font-semibold uppercase tracking-wide mt-1">
              {project.region}
            </p>
          </div>

          <div className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  projectStatusBadge[project.status] || 'bg-slate-100 text-slate-700'
                }`}
              >
                {project.status.replace('_', ' ')}
              </span>
              {project.status === 'withdrawn' && (
                <span className="text-sm text-slate-600">Project withdrawn from bidding.</span>
              )}
            </div>
            {!project.professionals?.some((pp) => pp.status === 'awarded') &&
              project.status !== 'withdrawn' && (
                <button
                  onClick={handleWithdrawProject}
                  disabled={withdrawing}
                  className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {withdrawing ? 'Withdrawing…' : 'Withdraw Project'}
                </button>
              )}
          </div>

          <div className="p-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="font-semibold text-slate-700">Budget:</span>
                <span className="text-slate-600">{project.budget ? `$${project.budget}` : 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="font-semibold text-slate-700">Professionals:</span>
                <span className="text-slate-600">{project.professionals?.length || 0}</span>
              </div>
            </div>

            {project.notes && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm border border-slate-100">
                <p className="font-semibold text-slate-800 mb-1">Notes</p>
                <p className="text-slate-700 leading-relaxed">{project.notes}</p>
              </div>
            )}
          </div>
        </div>

          {/* Awarded Details */}
          {project.professionals && project.professionals.some((pp) => pp.status === 'awarded') && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm">
              <div className="px-5 py-4 border-b border-emerald-200">
                <h2 className="text-lg font-bold text-emerald-900">Awarded Project Details</h2>
                <p className="text-sm text-emerald-800">Scheduling and contractor contact information</p>
              </div>
              <div className="p-5 space-y-5">
                {/* Schedule Section */}
                <div className="rounded-md bg-white px-4 py-4 text-sm border border-emerald-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-emerald-900">Project Schedule</p>
                    <button
                      onClick={() => {
                        setEditingSchedule(!editingSchedule);
                        setScheduleForm({
                          startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '',
                          endDate: project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : '',
                        });
                      }}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      {editingSchedule ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                  {!editingSchedule ? (
                    <div className="grid gap-2 md:grid-cols-2 text-emerald-800">
                      <div><span className="font-medium">Start Date:</span> {project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Not set'}</div>
                      <div><span className="font-medium">End Date:</span> {project.endDate ? new Date(project.endDate).toLocaleDateString() : 'Not set'}</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-emerald-900 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={scheduleForm.startDate}
                          onChange={(e) => setScheduleForm((prev) => ({ ...prev, startDate: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-emerald-900 mb-1">End Date</label>
                        <input
                          type="date"
                          value={scheduleForm.endDate}
                          onChange={(e) => setScheduleForm((prev) => ({ ...prev, endDate: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        onClick={handleScheduleSave}
                        disabled={updatingSchedule}
                        className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {updatingSchedule ? 'Saving...' : 'Save Schedule'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Contractor Contact Section */}
                <div className="rounded-md bg-white px-4 py-4 text-sm border border-emerald-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-emerald-900">Contractor Contact</p>
                    <button
                      onClick={() => {
                        setEditingContact(!editingContact);
                        const awarded = project.professionals?.find((pp) => pp.status === 'awarded');
                        setContactForm({
                          name: project.contractorContactName || awarded?.professional.fullName || awarded?.professional.businessName || '',
                          phone: project.contractorContactPhone || awarded?.professional.phone || '',
                          email: project.contractorContactEmail || awarded?.professional.email || '',
                        });
                      }}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      {editingContact ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                  {!editingContact ? (
                    (() => {
                      const awarded = project.professionals?.find((pp) => pp.status === 'awarded');
                      const displayName = awarded?.professional.fullName || awarded?.professional.businessName || awarded?.professional.email || '—';
                      const phone = project.contractorContactPhone || awarded?.professional.phone || '—';
                      const email = project.contractorContactEmail || awarded?.professional.email || '—';
                      const name = project.contractorContactName || displayName;
                      return (
                        <div className="grid gap-2 md:grid-cols-3 text-emerald-800">
                          <div><span className="font-medium">Name:</span> {name}</div>
                          <div><span className="font-medium">Phone:</span> {phone}</div>
                          <div><span className="font-medium">Email:</span> {email}</div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-emerald-900 mb-1">Name</label>
                        <input
                          type="text"
                          value={contactForm.name}
                          onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-emerald-900 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={contactForm.phone}
                          onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-emerald-900 mb-1">Email</label>
                        <input
                          type="email"
                          value={contactForm.email}
                          onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        onClick={handleContactSave}
                        disabled={updatingContact}
                        className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {updatingContact ? 'Saving...' : 'Save Contact'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Invoice & Payment Section */}
                {(() => {
                  const awarded = project.professionals?.find((pp) => pp.status === 'awarded');
                  if (!awarded?.invoice) return null;

                  const invoice = awarded.invoice;
                  const isPaid = invoice.paymentStatus === 'paid';

                  return (
                    <div className="rounded-md bg-white px-4 py-4 text-sm border border-blue-200">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold text-blue-900">💰 Invoice & Escrow</p>
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${isPaid ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {isPaid ? '✓ Paid' : 'Pending Payment'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="grid gap-2 md:grid-cols-2 text-blue-800">
                          <div><span className="font-medium">Invoice Amount:</span> ${Number(invoice.amount).toFixed(2)}</div>
                          {isPaid && invoice.paidAt && (
                            <div><span className="font-medium">Paid On:</span> {new Date(invoice.paidAt).toLocaleDateString()}</div>
                          )}
                        </div>
                        
                        {!isPaid && (
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                            <p className="text-xs text-blue-900 font-medium">
                              ℹ️ Escrow Protection
                            </p>
                            <p className="text-xs text-blue-800">
                              Your payment will be held securely in Fitout Hub's escrow account. 
                              Funds are only released to the professional according to project milestones.
                            </p>
                            <button
                              onClick={handlePayInvoice}
                              disabled={payingInvoice}
                              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {payingInvoice ? 'Processing Payment...' : '💳 Pay Invoice & Deposit to Escrow'}
                            </button>
                          </div>
                        )}

                        {isPaid && (
                          <div className="bg-green-50 border border-green-200 rounded-md p-3">
                            <p className="text-xs text-green-900">
                              ✓ <strong>Payment Received!</strong> Funds are securely held in escrow and will be released according to project milestones.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

        {/* Professionals Summary Table */}
        {project.professionals && project.professionals.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Invited Professionals</h2>
                <p className="text-sm text-slate-600">Click a row to open the chat with that professional.</p>
              </div>
              <Link
                href={`/professionals?projectId=${projectId}`}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
              >
                + Invite More
              </Link>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Quote</th>
                    <th className="py-2 pr-4">Messages</th>
                    <th className="py-2">Rating</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {project.professionals.map((pp) => {
                    const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                    return (
                      <tr
                        key={pp.id}
                        onClick={() => setSelectedProfessional(pp)}
                        className={`${selectedProfessional?.id === pp.id ? 'bg-blue-50' : 'hover:bg-slate-50'} cursor-pointer border-t border-slate-100`}
                      >
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                              {displayName[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800">{displayName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="inline-block rounded-full px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-800 capitalize">{pp.status.replace('_', ' ')}</span>
                        </td>
                        <td className="py-2 pr-4">
                          {pp.quoteAmount ? (
                            <span className="font-semibold text-blue-700">${typeof pp.quoteAmount === 'number' ? pp.quoteAmount.toLocaleString() : pp.quoteAmount}</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">Open chat for count</td>
                        <td className="py-2 text-slate-500">—</td>
                        <td className="py-2 pr-4">
                          {pp.status === 'selected' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                inviteNow(pp);
                              }}
                              disabled={!!actionBusy && actionBusy === `invite-${pp.professionalId}`}
                              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {actionBusy === `invite-${pp.professionalId}` ? 'Inviting…' : 'Invite now'}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Assistance (FOH) Mini Card and Messages */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Fitout Hub Assistance</h2>
            <button
              onClick={() => setAssistOpen(true)}
              disabled={!assistRequestId}
              className={`w-full text-left rounded-lg border px-4 py-3 transition ${assistRequestId ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'}`}
            >
              <div className="font-semibold text-slate-900">Project Assistance</div>
              <div className="text-xs text-slate-600 mt-1">
                {assistLoading ? 'Loading…' : assistRequestId ? `${assistMessages.length} messages` : 'No assistance thread'}
              </div>
              {assistError && (
                <div className="mt-2 text-xs text-rose-600">{assistError}</div>
              )}
            </button>
          </div>

          {/* Messages Panel */}
          {assistOpen && (
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 rounded-t-xl flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Communications with Fitout Hub</h3>
                <button
                  type="button"
                  onClick={() => setAssistOpen(false)}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
              <div className="p-4">
                <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                  {assistLoading ? (
                    <div className="text-center text-sm text-slate-500">Loading messages...</div>
                  ) : assistMessages.length === 0 ? (
                    <div className="text-center text-sm text-slate-500">No assistance messages yet.</div>
                  ) : (
                    assistMessages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${msg.senderType === 'client' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                          <p>{msg.content}</p>
                          <p className={`text-xs mt-1 ${msg.senderType === 'client' ? 'text-blue-100' : 'text-slate-500'}`}>
                            {new Date(msg.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Send Assistance Message */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={assistNewMessage}
                    onChange={(e) => setAssistNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !assistSending) {
                        (async () => {
                          if (!assistRequestId || !assistNewMessage.trim() || !accessToken) return;
                          try {
                            setAssistSending(true);
                            const res = await fetch(`${API_BASE_URL}/assist-requests/${encodeURIComponent(assistRequestId)}/messages`, {
                              method: 'POST',
                              headers: {
                                Authorization: `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ sender: 'client', content: assistNewMessage.trim() }),
                            });
                            if (!res.ok) {
                              const text = await res.text();
                              throw new Error(text || 'Failed to send assistance message');
                            }
                            const created = await res.json();
                            const m = created?.id ? created : (created.message || created);
                            setAssistMessages((prev) => [
                              ...prev,
                              {
                                id: m.id,
                                projectProfessionalId: '',
                                senderType: 'client',
                                content: m.content,
                                createdAt: m.createdAt,
                              },
                            ]);
                            setAssistNewMessage('');
                          } catch (err) {
                            console.error('Assist message send failed', err);
                            toast.error('Failed to send message to Fitout Hub');
                          } finally {
                            setAssistSending(false);
                          }
                        })();
                      }
                    }}
                    placeholder="Type a message to Fitout Hub..."
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    disabled={assistSending || !assistRequestId}
                  />
                  <button
                    onClick={async () => {
                      if (!assistRequestId || !assistNewMessage.trim() || !accessToken) return;
                      try {
                        setAssistSending(true);
                        const res = await fetch(`${API_BASE_URL}/assist-requests/${encodeURIComponent(assistRequestId)}/messages`, {
                          method: 'POST',
                          headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ sender: 'client', content: assistNewMessage.trim() }),
                        });
                        if (!res.ok) {
                          const text = await res.text();
                          throw new Error(text || 'Failed to send assistance message');
                        }
                        const created = await res.json();
                        const m = created?.id ? created : (created.message || created);
                        setAssistMessages((prev) => [
                          ...prev,
                          {
                            id: m.id,
                            projectProfessionalId: '',
                            senderType: 'client',
                            content: m.content,
                            createdAt: m.createdAt,
                          },
                        ]);
                        setAssistNewMessage('');
                      } catch (err) {
                        console.error('Assist message send failed', err);
                        toast.error('Failed to send message to Fitout Hub');
                      } finally {
                        setAssistSending(false);
                      }
                    }}
                    disabled={assistSending || !assistNewMessage.trim() || !assistRequestId}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {assistSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Professionals & Messaging */}
        {project.professionals && project.professionals.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Professionals List */}
            <div className="lg:col-span-1 space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Professionals</h2>
              {project.professionals.map((prof) => (
                <button
                  key={prof.id}
                  onClick={() => setSelectedProfessional(prof)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition ${
                    selectedProfessional?.id === prof.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-900">
                    {prof.professional.fullName || prof.professional.businessName || prof.professional.email}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Status: <span className="capitalize font-medium">{prof.status}</span>
                  </div>
                  {prof.quoteAmount && (
                    <div className="text-xs text-blue-700 mt-1 font-semibold">
                      Quote: ${prof.quoteAmount}
                    </div>
                  )}
                  {prof.status === 'selected' && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          inviteNow(prof);
                        }}
                        disabled={!!actionBusy && actionBusy === `invite-${prof.professionalId}`}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {actionBusy === `invite-${prof.professionalId}` ? 'Inviting…' : 'Invite now'}
                      </button>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Messages Panel */}
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 rounded-t-xl">
                <h3 className="font-bold text-slate-900">
                  {selectedProfessional
                    ? `Chat with ${selectedProfessional.professional.fullName || selectedProfessional.professional.businessName || selectedProfessional.professional.email}`
                    : 'Select a professional to chat'}
                </h3>
              </div>

              {selectedProfessional && (
                <div className="p-4 space-y-4">
                  {/* Quote Actions */}
                  {selectedProfessional.quoteAmount && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={!!actionBusy}
                        onClick={() => actOnQuote('accept')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {actionBusy === 'accept' ? 'Accepting…' : 'Accept Quote'}
                      </button>
                      <button
                        disabled={!!actionBusy}
                        onClick={() => actOnQuote('reject')}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {actionBusy === 'reject' ? 'Rejecting…' : 'Reject Quote'}
                      </button>
                      <button
                        disabled={!!actionBusy}
                        onClick={() => actOnQuote('request-better')}
                        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {actionBusy === 'request-better' ? 'Requesting…' : 'Ask for better offer'}
                      </button>
                    </div>
                  )}

                  {messageError && (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {messageError}
                    </div>
                  )}

                  {/* Messages */}
                  <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                    {loadingMessages ? (
                      <div className="text-center text-sm text-slate-500">Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-sm text-slate-500">
                        No messages yet. Start the conversation!
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                              msg.senderType === 'client'
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <p className={`text-xs mt-1 ${msg.senderType === 'client' ? 'text-blue-100' : 'text-slate-500'}`}>
                              {new Date(msg.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Send Message */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !sending) {
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type your message..."
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      disabled={sending}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {(!project.professionals || project.professionals.length === 0) && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-4">
            <div className="text-slate-600">
              <p className="text-base font-semibold mb-2">No professionals invited yet</p>
              <p className="text-sm">Start by searching for professionals who match your project needs.</p>
            </div>
            <Link
              href={`/professionals?projectId=${projectId}`}
              className="inline-block rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 text-sm font-semibold transition"
            >
              Search & Invite Professionals
            </Link>
          </div>
        )}

        <BackToTop />
      </div>

      {/* Contact Sharing Modal */}
      {showContactModal && awardedProfessional && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">🎉 Quote Awarded!</h3>
            <p className="text-sm text-slate-700">
              You've selected <strong>{awardedProfessional.professional.fullName || awardedProfessional.professional.businessName}</strong> for this project.
            </p>

            {sharedContact ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-900">Professional Contact Details:</p>
                <p className="text-sm text-blue-800"><strong>Name:</strong> {sharedContact.name}</p>
                <p className="text-sm text-blue-800"><strong>Phone:</strong> {sharedContact.phone}</p>
                <p className="text-sm text-blue-800"><strong>Email:</strong> {sharedContact.email}</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-xs text-amber-900 font-medium">
                    💡 <strong>Recommendation:</strong> We encourage keeping all communications on the platform for transparency, professional record-keeping, and to maintain the project management trail.
                  </p>
                </div>

                <p className="text-sm text-slate-600">
                  Would you like to share contact details or continue via the platform?
                </p>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleContinueOnPlatform}
                    className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Continue on Platform
                  </button>
                  <button
                    onClick={handleShareContact}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Share Contact Details
                  </button>
                </div>
              </>
            )}

            {sharedContact && (
              <button
                onClick={() => setShowContactModal(false)}
                className="w-full rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
