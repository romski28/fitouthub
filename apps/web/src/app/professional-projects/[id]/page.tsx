'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import ProjectInfoCard from '@/components/project-info-card';
import { ProjectTabs } from '@/components/project-tabs';
import { OverviewTab } from './tabs/overview-tab';
import { SiteAccessTab } from './tabs/site-access-tab';
import { ContractTab } from './tabs/contract-tab';
import { FinancialsTab } from './tabs/financials-tab';
import { ScheduleTab } from './tabs/schedule-tab';
import { ChatTab } from './tabs/chat-tab';

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
  createdAt?: string;
  updatedAt?: string;
  paymentRequests?: {
    id: string;
    requestType: string;
    requestAmount: string;
    requestPercentage?: number;
    status: string;
    notes?: string;
    createdAt: string;
  }[];
}

interface Message {
  id: string;
  projectProfessionalId: string;
  senderType: 'professional' | 'client' | string;
  content: string;
  createdAt: string;
}

interface SiteAccessData {
  addressFull: string;
  unitNumber?: string;
  floorLevel?: string;
  accessDetails?: string;
  onSiteContactName?: string;
  onSiteContactPhone?: string;
}

interface SiteAccessStatus {
  requestId: string | null;
  requestStatus: string;
  visitScheduledFor: string | null;
  visitScheduledAt?: string | null;
  visitedAt: string | null;
  reasonDenied: string | null;
  hasAccess: boolean;
  siteAccessData: SiteAccessData | null;
}

interface SiteAccessVisit {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'cancelled' | 'completed' | string;
  proposedAt: string;
  proposedByRole: 'professional' | 'client' | string;
  notes?: string | null;
  respondedAt?: string | null;
  responseNotes?: string | null;
  completedAt?: string | null;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectProfessionalId = params.id as string;

  const { isLoggedIn, accessToken } = useProfessionalAuth();
  const { openLoginModal } = useAuthModalControl();
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
    notes: '',
  });
  const [submittingAdvanceRequest, setSubmittingAdvanceRequest] = useState(false);
  const [siteAccessStatus, setSiteAccessStatus] = useState<SiteAccessStatus | null>(null);
  const [siteAccessLoading, setSiteAccessLoading] = useState(false);
  const [siteAccessError, setSiteAccessError] = useState<string | null>(null);
  const [siteAccessActionLoading, setSiteAccessActionLoading] = useState(false);
  const [visitNotes, setVisitNotes] = useState('');
  const [siteVisits, setSiteVisits] = useState<SiteAccessVisit[]>([]);
  const [siteVisitLoading, setSiteVisitLoading] = useState(false);
  const [siteVisitError, setSiteVisitError] = useState<string | null>(null);
  const [siteVisitActionLoading, setSiteVisitActionLoading] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitRequestNotes, setVisitRequestNotes] = useState('');
  const [visitResponseNotes, setVisitResponseNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});

  const toggleAccordion = (id: string) => {
    setExpandedAccordions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Scroll to top on page load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Auto-switch tabs based on project status
  useEffect(() => {
    if (project) {
      // If on site-access tab but project is awarded, switch to schedule
      if (activeTab === 'site-access' && project.status === 'awarded') {
        setActiveTab('schedule');
      }
      // If on schedule tab but project is not awarded, switch to site-access
      if (activeTab === 'schedule' && project.status !== 'awarded') {
        setActiveTab('site-access');
      }
    }
  }, [project?.status]);

  // Allow deep-linking to tab from dashboard/actions via ?tab=
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (!requestedTab || !project) return;

    const allowedTabs = new Set(['overview', 'financials', 'chat']);
    if (project.status === 'awarded') {
      allowedTabs.add('contract');
      allowedTabs.add('schedule');
    } else {
      allowedTabs.add('site-access');
    }

    setActiveTab(allowedTabs.has(requestedTab) ? requestedTab : 'overview');
  }, [searchParams, project]);

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
        const response = await fetchWithRetry(
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
            openLoginModal();
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

  useEffect(() => {
    const fetchSiteAccessStatus = async () => {
      if (!accessToken || !project?.project?.id) {
        return;
      }

      setSiteAccessLoading(true);
      setSiteAccessError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/projects/${project.project.id}/site-access/status`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load site access status');
        }

        const data = await response.json();
        setSiteAccessStatus(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load site access status';
        setSiteAccessError(message);
      } finally {
        setSiteAccessLoading(false);
      }
    };

    fetchSiteAccessStatus();
  }, [accessToken, project?.project?.id]);

  useEffect(() => {
    const fetchSiteVisits = async () => {
      if (!accessToken || !project?.project?.id) {
        return;
      }

      setSiteVisitLoading(true);
      setSiteVisitError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/projects/${project.project.id}/site-visits`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load site visits');
        }

        const data = await response.json();
        setSiteVisits(data.visits || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load site visits';
        setSiteVisitError(message);
      } finally {
        setSiteVisitLoading(false);
      }
    };

    fetchSiteVisits();
  }, [accessToken, project?.project?.id]);

  const handleRequestSiteAccess = async () => {
    if (!accessToken || !project?.project?.id) return;
    setSiteAccessActionLoading(true);
    setSiteAccessError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${project.project.id}/site-access/request`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to request site access');
      }

      toast.success('Site access request sent to the client.');
      const data = await response.json();
      setSiteAccessStatus((prev) => ({
        requestId: data.request?.id || prev?.requestId || null,
        requestStatus: data.request?.status || 'pending',
        visitScheduledFor: prev?.visitScheduledFor || null,
        visitScheduledAt: prev?.visitScheduledAt || null,
        visitedAt: prev?.visitedAt || null,
        reasonDenied: prev?.reasonDenied || null,
        hasAccess: prev?.hasAccess || false,
        siteAccessData: prev?.siteAccessData || null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request site access';
      setSiteAccessError(message);
    } finally {
      setSiteAccessActionLoading(false);
    }
  };

  const handleRequestSiteVisit = async () => {
    if (!accessToken || !project?.project?.id) return;

    if (!visitDate || !visitTime) {
      setSiteVisitError('Please select a date and time for the visit');
      return;
    }

    const scheduledAt = new Date(`${visitDate}T${visitTime}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setSiteVisitError('Please enter a valid visit date and time');
      return;
    }

    setSiteVisitActionLoading(true);
    setSiteVisitError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${project.project.id}/site-visits`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scheduledAt: scheduledAt.toISOString(),
            notes: visitRequestNotes || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to request site visit');
      }

      const data = await response.json();
      toast.success('Site visit request sent to the client.');
      if (data.visit) {
        setSiteVisits((prev) => [data.visit, ...prev]);
      }
      setVisitDate('');
      setVisitTime('');
      setVisitRequestNotes('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request site visit';
      setSiteVisitError(message);
    } finally {
      setSiteVisitActionLoading(false);
    }
  };

  const handleRespondSiteVisit = async (visitId: string, status: 'accepted' | 'declined') => {
    if (!accessToken) return;
    setSiteVisitActionLoading(true);
    setSiteVisitError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/site-visits/${visitId}/respond`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status,
            responseNotes: visitResponseNotes[visitId] || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to respond to site visit');
      }

      const data = await response.json();
      setSiteVisits((prev) =>
        prev.map((visit) => (visit.id === visitId ? data.visit : visit)),
      );
      setVisitResponseNotes((prev) => ({ ...prev, [visitId]: '' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to respond to site visit';
      setSiteVisitError(message);
    } finally {
      setSiteVisitActionLoading(false);
    }
  };

  const handleCompleteSiteVisit = async (visitId: string) => {
    if (!accessToken) return;
    setSiteVisitActionLoading(true);
    setSiteVisitError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/site-visits/${visitId}/complete`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            visitDetails: visitNotes || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to complete site visit');
      }

      const data = await response.json();
      setSiteVisits((prev) =>
        prev.map((visit) => (visit.id === visitId ? data.visit : visit)),
      );
      setVisitNotes('');
      toast.success('Site visit marked as completed.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete site visit';
      setSiteVisitError(message);
    } finally {
      setSiteVisitActionLoading(false);
    }
  };

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
      setTimeout(() => {
        router.push('/professional-projects');
      }, 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject project';
      setError(message);
      toast.error(message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleSubmitAdvanceRequest = async (override?: Partial<typeof advanceRequestForm>) => {
    if (!accessToken || !projectProfessionalId) return;

    const form = { ...advanceRequestForm, ...override };

    // Validate form
    if (form.requestType === 'fixed') {
      const amount = parseFloat(form.amount);
      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }
    } else {
      const percentage = parseFloat(form.percentage);
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
            requestType: form.requestType,
            amount: form.requestType === 'fixed' 
              ? parseFloat(form.amount) 
              : undefined,
            percentage: form.requestType === 'percentage' 
              ? parseFloat(form.percentage) 
              : undefined,
            notes: form.notes,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Payment request error:', errorText);
        let errorMessage = 'Failed to submit advance payment request';
        try {
          const data = JSON.parse(errorText);
          errorMessage = data.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      toast.success('Payment request submitted! Client will be notified.');
      setShowAdvanceRequestForm(false);
      setAdvanceRequestForm({ requestType: 'fixed', amount: '', percentage: '', notes: '' });
      
      // Refresh project data
      window.location.reload();
    } catch (err) {
      console.error('Payment request exception:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit request';
      toast.error(message);
    } finally {
      setSubmittingAdvanceRequest(false);
    }
  };

  const handleSubmitPaymentRequest = async (amount: number, type: string, notes: string) => {
    const normalizedType = type === 'percentage' ? 'percentage' : 'fixed';
    await handleSubmitAdvanceRequest({
      requestType: normalizedType,
      amount: normalizedType === 'fixed' ? amount.toString() : '',
      percentage: normalizedType === 'percentage' ? amount.toString() : '',
      notes,
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
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

  const mappedPaymentRequests = (project.paymentRequests || []).map((request) => {
    const amount = Number(request.requestAmount);
    return {
      id: request.id,
      amount: Number.isNaN(amount) ? 0 : amount,
      type: request.requestType,
      status: request.status,
      notes: request.notes,
      createdAt: request.createdAt,
    };
  });

  const paymentRequestAmount =
    advanceRequestForm.requestType === 'fixed'
      ? advanceRequestForm.amount
      : advanceRequestForm.percentage;

  const awardedAmountValue = project.quoteAmount ? Number(project.quoteAmount) : undefined;
  const projectBudgetValue = project.project.budget ? Number(project.project.budget) : undefined;
  const totalRequested = mappedPaymentRequests.reduce((sum, request) => sum + request.amount, 0);
  const totalPaid = mappedPaymentRequests
    .filter((request) => request.status === 'paid' || request.status === 'approved')
    .reduce((sum, request) => sum + request.amount, 0);

  const projectFinancials = project.status === 'awarded'
    ? {
        projectBudget: projectBudgetValue,
        awardedAmount: awardedAmountValue,
        totalPaymentRequest: totalRequested,
        totalPaid,
        balance: awardedAmountValue !== undefined ? awardedAmountValue - totalPaid : undefined,
      }
    : null;

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
            createdAt={project!.createdAt}
            updatedAt={project!.updatedAt}
            quoteAmount={project!.quoteAmount}
          />

          <ProjectTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={(() => {
              // Build tabs array conditionally
              const tabsArray = [
                { id: 'overview', label: 'Overview', icon: '📋' },
              ];
              
              // Show Site Access tab only during bidding stage (not awarded)
              if (project.status !== 'awarded') {
                tabsArray.push({ id: 'site-access', label: 'Access & Schedule', icon: '📍' });
              }
              
              // Show Contract and Schedule tabs only when awarded
              if (project.status === 'awarded') {
                tabsArray.push({ id: 'contract', label: 'Contract', icon: '📄' });
                tabsArray.push({ id: 'schedule', label: 'Schedule', icon: '📅' });
              }
              
              // Always show financials and chat
              tabsArray.push({ id: 'financials', label: 'Financials', icon: '💳' });
              tabsArray.push({ id: 'chat', label: 'Chat', icon: '💬' });
              
              return tabsArray;
            })()}
          >
            <OverviewTab
              tab="overview"
              project={project}
              quoteForm={quoteForm}
              onUpdateQuoteForm={(patch) =>
                setQuoteForm((prev) => ({
                  ...prev,
                  ...patch,
                }))
              }
              onSubmitQuote={handleSubmitQuote}
              onAccept={handleAccept}
              onReject={handleReject}
              onKeepCurrentQuote={handleKeepCurrentQuote}
              submittingQuote={submittingQuote}
              accessToken={accessToken}
            />

            <SiteAccessTab
              tab="site-access"
              siteAccessStatus={siteAccessStatus}
              siteAccessLoading={siteAccessLoading}
              siteAccessError={siteAccessError}
              siteVisits={siteVisits}
              siteVisitLoading={siteVisitLoading}
              siteVisitError={siteVisitError}
              expandedAccordions={expandedAccordions}
              onToggleAccordion={toggleAccordion}
              onRequestSiteAccess={handleRequestSiteAccess}
              onRequestSiteVisit={handleRequestSiteVisit}
              onRespondSiteVisit={handleRespondSiteVisit}
              onCompleteSiteVisit={handleCompleteSiteVisit}
              siteAccessActionLoading={siteAccessActionLoading}
              siteVisitActionLoading={siteVisitActionLoading}
              visitDate={visitDate}
              onUpdateVisitDate={setVisitDate}
              visitTime={visitTime}
              onUpdateVisitTime={setVisitTime}
              visitRequestNotes={visitRequestNotes}
              onUpdateVisitRequestNotes={setVisitRequestNotes}
              visitNotes={visitNotes}
              onUpdateVisitNotes={setVisitNotes}
              visitResponseNotes={visitResponseNotes}
              onUpdateVisitResponseNotes={setVisitResponseNotes}
            />

            <ContractTab
              tab="contract"
              projectId={project.project.id}
              accessToken={accessToken}
            />

            <ScheduleTab
              tab="schedule"
              projectId={project.project.id}
              projectProfessionalId={projectProfessionalId}
              projectStatus={project.status}
              tradeId=""
              accessToken={accessToken || null}
              onMilestonesUpdate={() => {
                // Refresh project data if needed
              }}
            />

            <FinancialsTab
              tab="financials"
              projectStatus={project.status}
              projectBudget={projectBudgetValue}
              awardedAmount={awardedAmountValue}
              paymentRequests={mappedPaymentRequests}
              projectFinancials={projectFinancials}
              paymentRequestLoading={false}
              paymentRequestError={null}
              onSubmitPaymentRequest={handleSubmitPaymentRequest}
              paymentRequestActionLoading={submittingAdvanceRequest}
              paymentRequestAmount={paymentRequestAmount}
              onUpdatePaymentRequestAmount={(value) => {
                setAdvanceRequestForm((prev) =>
                  prev.requestType === 'fixed'
                    ? { ...prev, amount: value }
                    : { ...prev, percentage: value },
                );
              }}
              paymentRequestType={advanceRequestForm.requestType}
              onUpdatePaymentRequestType={(type) => {
                setAdvanceRequestForm((prev) => ({
                  ...prev,
                  requestType: type === 'percentage' ? 'percentage' : 'fixed',
                }));
              }}
              paymentRequestNotes={advanceRequestForm.notes}
              onUpdatePaymentRequestNotes={(notes) => {
                setAdvanceRequestForm((prev) => ({
                  ...prev,
                  notes,
                }));
              }}
            />

            <ChatTab
              tab="chat"
              projectId={project.project.id}
              projectStatus={project.status}
              clientName={project.project.clientName}
              accessToken={accessToken || undefined}
              messages={messages}
              newMessage={newMessage}
              onNewMessageChange={setNewMessage}
              onSendMessage={() => handleSendMessage()}
              sending={sending}
              messageError={messageError}
            />
          </ProjectTabs>
        </div>
      </div>

      <Toaster position="top-right" />
    </>
  );
}
