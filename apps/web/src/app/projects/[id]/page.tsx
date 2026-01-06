'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';
import { ProjectProgressBar } from '@/components/project-progress-bar';
import ProjectChat from '@/components/project-chat';
import ProjectFinancialsCard from '@/components/project-financials-card';
import { ProjectImagesCard } from '@/components/project-images-card';
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
  status?: string;
  budget?: string;
  notes?: string;
  professionals?: ProjectProfessional[];
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
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

const formatDate = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

const formatHKD = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'HK$ —';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

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
  const [viewingAssistChat, setViewingAssistChat] = useState(false);

  // Derived values
  const projectStatus = project?.status ?? 'pending';

  // Scroll to top on page load
  useEffect(() => {
    // Use setTimeout to ensure DOM is rendered before scrolling
    const scrollTimer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(scrollTimer);
  }, [projectId]);

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
          router.push('/');
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
      router.push('/');
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
          router.push('/');
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

  // Refresh assist messages when viewing assist chat
  useEffect(() => {
    if (!viewingAssistChat || !assistRequestId || !accessToken) return;

    const refreshAssistMessages = async () => {
      try {
        setAssistLoading(true);
        setAssistError(null);
        const res = await fetch(`${API_BASE_URL}/assist-requests/${encodeURIComponent(assistRequestId)}/messages`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const msgs = await res.json();
          const normalized = Array.isArray(msgs) ? msgs : (msgs.messages || []);
          const mapped: Message[] = normalized.map((m: any) => ({
            id: m.id,
            projectProfessionalId: '',
            senderType: (m.senderType as any) || 'foh',
            content: m.content,
            createdAt: m.createdAt,
          }));
          setAssistMessages(mapped);
        }
      } catch (err) {
        console.error('Error refreshing assist messages:', err);
      } finally {
        setAssistLoading(false);
      }
    };
    refreshAssistMessages();
  }, [viewingAssistChat, assistRequestId, accessToken]);

  const handleSendAssistMessage = async () => {
    if (!assistNewMessage.trim() || !assistRequestId || !accessToken) return;

    try {
      setAssistSending(true);
      setAssistError(null);
      const res = await fetch(
        `${API_BASE_URL}/assist-requests/${encodeURIComponent(assistRequestId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: assistNewMessage.trim() }),
        },
      );

      if (!res.ok) throw new Error('Failed to send message');

      const data = await res.json();
      const mapped: Message = {
        id: data.id,
        projectProfessionalId: '',
        senderType: 'client',
        content: data.content,
        createdAt: data.createdAt,
      };
      setAssistMessages((prev) => [...prev, mapped]);
      setAssistNewMessage('');
    } catch (err) {
      console.error('Error sending assist message:', err);
      setAssistError('Failed to send message');
    } finally {
      setAssistSending(false);
    }
  };

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
        router.push('/');
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
          router.push('/');
          return;
        }
        if (!res.ok) throw new Error('Award failed');
        
        toast.success('Quote accepted! Project awarded to professional.');
        
        // Show contact sharing modal
        setAwardedProfessional(selectedProfessional);
        setShowContactModal(true);
        
        // Update local state
        setSelectedProfessional((prev) => (prev ? { ...prev, status: 'awarded' } : prev));
        
        // Refresh project to update project.status to 'awarded'
        await fetchProject();
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
          router.push('/');
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

  const handleSaveImageNote = async (photoId: string, note: string) => {
    if (!accessToken || !projectId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/photos/${photoId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note }),
      });

      if (!res.ok) {
        throw new Error('Failed to update photo note');
      }

      // Refresh project to update photos
      await fetchProject();
      toast.success('Photo note updated!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update photo note';
      toast.error(message);
      console.error('Photo update error:', err);
    }
  };

  const handleWithdrawProject = async () => {
    if (!accessToken || !projectId) return;

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
      setShowWithdrawConfirm(false);
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
          router.push('/');
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

  const awardedPro = project?.professionals?.find((p) => p.status === 'awarded');
  const isAwarded = project?.status === 'awarded' || Boolean(awardedPro);
  const projectCostValue = awardedPro?.quoteAmount ?? project?.budget ?? 0;
  const escrowValue = (awardedPro as any)?.invoice?.amount ?? (project as any)?.escrowAmount ?? 0;
  const paidValue = (project as any)?.paidAmount ?? (awardedPro as any)?.invoice?.paidAmount ?? 0;

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
          <div className={`px-5 py-4 text-white rounded-t-xl ${
            projectStatus === 'withdrawn'
              ? 'bg-gradient-to-r from-slate-400 to-slate-300'
              : 'bg-gradient-to-r from-slate-900 to-slate-800'
          }`}>
            <h1 className={`text-2xl font-bold ${projectStatus === 'withdrawn' ? 'text-slate-700' : ''}`}>
              {project.projectName}
            </h1>
            <p className={`text-sm font-semibold uppercase tracking-wide mt-1 ${
              projectStatus === 'withdrawn'
                ? 'text-slate-600'
                : 'text-emerald-300'
            }`}>
              {project.region}
            </p>
          </div>

          <div className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  projectStatusBadge[projectStatus] || 'bg-slate-100 text-slate-700'
                }`}
              >
                {projectStatus.replace('_', ' ')}
              </span>
              {projectStatus === 'withdrawn' && (
                <span className="text-sm text-slate-600">Project withdrawn from bidding.</span>
              )}
            </div>
            {!project.professionals?.some((pp) => pp.status === 'awarded') &&
              projectStatus !== 'withdrawn' && (
                <button
                  onClick={() => setShowWithdrawConfirm(true)}
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
                <span className="text-slate-600">{project.budget ? formatHKD(project.budget) : 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="font-semibold text-slate-700">Professionals:</span>
                <span className="text-slate-600">{project.professionals?.length || 0}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="font-semibold text-slate-700">Created:</span>
                <span className="text-slate-600">{formatDate(project.createdAt)}</span>
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

        {/* Project Progress - Moved to 2nd position */}
        <ProjectProgressBar
          project={{
            id: project.id,
            status: project.status,
            startDate: project.startDate,
            endDate: project.endDate,
            professionals:
              project.professionals?.map((p) => ({
                status: p.status,
                quoteAmount: p.quoteAmount,
                invoice: p.invoice || null,
              })) || [],
          }}
          hasAssist={!!assistRequestId}
          variant="full"
        />

          {/* Project Financials */}
          {accessToken && (
            <ProjectFinancialsCard
              projectId={project.id}
              accessToken={accessToken}
              projectCost={projectCostValue}
              role="client"
            />
          )}

          {/* Project Images */}
          <ProjectImagesCard
            photos={(project as any).photos || []}
            onPhotoNoteUpdate={handleSaveImageNote}
            isLoading={loading}
          />

          {/* Awarded Details - REMOVED, combined with new awarded chat panel above */}

        {/* Professionals Summary Table - Hidden when project is awarded */}
        {project.professionals && project.professionals.length > 0 && !project.professionals.some((pp) => pp.status === 'awarded') && (
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
                  {assistRequestId && (
                    <tr
                      onClick={() => {
                        setSelectedProfessional(null);
                        setViewingAssistChat(true);
                      }}
                      className={`${viewingAssistChat ? 'bg-indigo-50' : 'hover:bg-slate-50'} cursor-pointer border-t border-slate-100`}
                    >
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            FH
                          </div>
                          <span className="font-medium text-slate-800">Fitout Hub</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="inline-block rounded-full px-2 py-1 text-xs font-semibold bg-indigo-100 text-indigo-800">Assisting</span>
                      </td>
                      <td className="py-2 pr-4">—</td>
                      <td className="py-2 pr-4">💬</td>
                      <td className="py-2">—</td>
                      <td className="py-2 pr-4">—</td>
                    </tr>
                  )}
                  {project.professionals.map((pp) => {
                    const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                    return (
                      <tr
                        key={pp.id}
                        onClick={() => {
                          setSelectedProfessional(pp);
                          setViewingAssistChat(false);
                        }}
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

        {/* Professionals & Messaging - Hidden when project is awarded */}
        {project.professionals && project.professionals.length > 0 && !project.professionals.some((pp) => pp.status === 'awarded') && (
          <div>
            {/* Messages Panel - Full Width */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {viewingAssistChat ? 'Fitout Hub Assistance' : (selectedProfessional
                        ? `Chat with ${selectedProfessional.professional.fullName || selectedProfessional.professional.businessName || selectedProfessional.professional.email}`
                        : 'Select a professional to chat')}
                    </h3>
                    {viewingAssistChat && (
                      <p className="text-xs text-slate-600 mt-1">
                        Get help from Fitout Hub experts
                      </p>
                    )}
                    {!viewingAssistChat && selectedProfessional && (
                      <p className="text-xs text-slate-600 mt-1">
                        {selectedProfessional.professional.fullName || selectedProfessional.professional.businessName || selectedProfessional.professional.email}
                      </p>
                    )}
                  </div>
                  {assistRequestId && (
                    <button
                      onClick={() => setViewingAssistChat(!viewingAssistChat)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                    >
                      {viewingAssistChat ? 'View Professional Chat' : 'Fitout Hub Assistance'}
                    </button>
                  )}
                </div>
              </div>

              {viewingAssistChat ? (
                <div className="p-4 space-y-4">
                  {assistError && (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {assistError}
                    </div>
                  )}

                  {/* Assist Messages */}
                  <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                    {assistLoading ? (
                      <div className="text-center text-sm text-slate-500">Loading messages...</div>
                    ) : assistMessages.length === 0 ? (
                      <div className="text-center text-sm text-slate-500">
                        No messages yet. Reach out to Fitout Hub for assistance!
                      </div>
                    ) : (
                      assistMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                              msg.senderType === 'client'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border border-indigo-200 text-slate-800'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <p className={`text-xs mt-1 ${msg.senderType === 'client' ? 'text-indigo-100' : 'text-slate-500'}`}>
                              {new Date(msg.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Send Assist Message */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={assistNewMessage}
                      onChange={(e) => setAssistNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !assistSending) {
                          handleSendAssistMessage();
                        }
                      }}
                      placeholder="Ask Fitout Hub for help..."
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      disabled={assistSending}
                    />
                    <button
                      onClick={handleSendAssistMessage}
                      disabled={assistSending || !assistNewMessage.trim()}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {assistSending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              ) : selectedProfessional && (
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

        {/* Awarded Project Chat Panel - Show when project is awarded */}
        {project.professionals && project.professionals.some((pp) => pp.status === 'awarded') && (
          <div className="space-y-5">
            {/* Unified Chat Section */}
            <div>
              <div className="mb-3">
                <h2 className="text-lg font-bold text-slate-900">Project Chat</h2>
                <p className="text-sm text-slate-600">Communicate with all awarded professionals and Fitout Hub</p>
              </div>

              {/* Chat Mode Selector - Dropdown */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="p-4 border-b border-slate-200">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Chat with:</label>
                  <select
                    value={
                      viewingAssistChat ? 'fitouthub' : 
                      selectedProfessional ? `professional-${selectedProfessional.id}` : 
                      'project'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'fitouthub') {
                        setViewingAssistChat(true);
                        setSelectedProfessional(null);
                      } else if (val === 'project') {
                        setViewingAssistChat(false);
                        setSelectedProfessional(null);
                      } else {
                        const profId = val.replace('professional-', '');
                        const prof = project.professionals?.find(p => p.id === profId);
                        if (prof) {
                          setSelectedProfessional(prof);
                          setViewingAssistChat(false);
                        }
                      }
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="project">Project (All professionals)</option>
                    {project.professionals?.map((pp) => {
                      const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                      return (
                        <option key={pp.id} value={`professional-${pp.id}`}>
                          {displayName}
                        </option>
                      );
                    })}
                    {assistRequestId && <option value="fitouthub">Fitout Hub</option>}
                  </select>
                </div>

                {/* Team Chat View */}
                {!viewingAssistChat && !selectedProfessional && (
                  <div>
                    <div className="p-4 bg-blue-50">
                      <p className="text-sm text-blue-700">Chat with all awarded professionals</p>
                    </div>
                    {accessToken && (
                      <ProjectChat
                        projectId={projectId}
                        accessToken={accessToken}
                        currentUserRole="client"
                      />
                    )}
                  </div>
                )}

                {/* Fitout Hub Assistance View */}
                {viewingAssistChat && (
                  <div className="bg-indigo-50 border-t border-indigo-200">
                    <div className="p-4 space-y-4">
                      {assistError && (
                        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          {assistError}
                        </div>
                      )}

                      {/* Assist Messages */}
                      <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                        {assistLoading ? (
                          <div className="text-center text-sm text-slate-500">Loading messages...</div>
                        ) : assistMessages.length === 0 ? (
                          <div className="text-center text-sm text-slate-500">
                            No messages yet. Reach out to Fitout Hub for assistance!
                          </div>
                        ) : (
                          assistMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                                  msg.senderType === 'client'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-indigo-200 text-slate-800'
                                }`}
                              >
                                <p>{msg.content}</p>
                                <p className={`text-xs mt-1 ${msg.senderType === 'client' ? 'text-indigo-100' : 'text-slate-500'}`}>
                                  {new Date(msg.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Send Assist Message */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={assistNewMessage}
                          onChange={(e) => setAssistNewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !assistSending) {
                              handleSendAssistMessage();
                            }
                          }}
                          placeholder="Ask Fitout Hub for help..."
                          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                          disabled={assistSending}
                        />
                        <button
                          onClick={handleSendAssistMessage}
                          disabled={assistSending || !assistNewMessage.trim()}
                          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {assistSending ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Private Chat with Professional View */}
                {!viewingAssistChat && selectedProfessional && (
                  <div className="bg-amber-50 border-t border-amber-200">
                    <div className="p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <h3 className="font-bold text-amber-900 text-sm">
                              Private Chat with {selectedProfessional.professional.fullName || selectedProfessional.professional.businessName || selectedProfessional.professional.email}
                            </h3>
                            <p className="text-xs text-amber-700">Only visible to you, this professional, and Fitout Hub</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedProfessional(null)}
                          className="text-amber-600 hover:text-amber-900"
                          title="Back to contacts"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      </div>

                      {messageError && (
                        <div className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800">
                          {messageError}
                        </div>
                      )}

                      {/* Messages */}
                      <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
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
                                    : 'bg-slate-100 border border-slate-200 text-slate-800'
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

                      {/* Send Message - Disabled if professional declined */}
                      {selectedProfessional.status === 'declined' ? (
                        <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm">
                          This professional has declined the project. This chat is read-only.
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <BackToTop />
      </div>

      {/* Withdraw Confirmation Modal */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Withdraw Project?</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-amber-900">
                This action will:
              </p>
              <ul className="text-sm text-amber-900 space-y-1 ml-4 list-disc">
                <li>Set the project status to <strong>withdrawn</strong></li>
                <li>Notify all invited professionals of the withdrawal</li>
                <li>Remove the project from active bidding</li>
              </ul>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to continue?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdrawProject}
                disabled={withdrawing}
                className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {withdrawing ? 'Withdrawing...' : 'Withdraw Project'}
              </button>
            </div>
          </div>
        </div>
      )}

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
