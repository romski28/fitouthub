'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';
import { ProjectProgressBar } from '@/components/project-progress-bar';
import ProjectChat from '@/components/project-chat';
import ChatImageUploader from '@/components/chat-image-uploader';
import ProjectFinancialsCard from '@/components/project-financials-card';
import { useFundsSecured } from '@/hooks/use-funds-secured';
import { ProjectImagesCard } from '@/components/project-images-card';
import { ProjectTabs, AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { OverviewTab } from '@/app/projects/[id]/tabs/overview-tab';
import { SiteAccessTab } from '@/app/projects/[id]/tabs/site-access-tab';
import { ProfessionalsTab } from '@/app/projects/[id]/tabs/professionals-tab';
import { MediaTab } from '@/app/projects/[id]/tabs/media-tab';
import { ChatTab } from '@/app/projects/[id]/tabs/chat-tab';
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
  approvedBudget?: string;
  notes?: string;
  siteAccessDataCollected?: boolean;
  siteAccessDataCollectedAt?: string;
  locationDetailsStatus?: string;
  locationDetailsRequiredAt?: string;
  locationDetailsProvidedAt?: string;
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
  attachments?: { url: string; filename: string }[];
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

interface SiteAccessRequest {
  id: string;
  status: string;
  requestedAt: string;
  respondedAt?: string;
  visitScheduledFor?: string | null;
  visitScheduledAt?: string | null;
  reasonDenied?: string | null;
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
    email?: string;
    phone?: string;
  };
  projectProfessional?: {
    id: string;
    status: string;
    quoteAmount?: string | number | null;
    quotedAt?: string | null;
  };
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
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
    email?: string;
  };
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
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; filename: string }[]>([]);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
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

  // Check if funds are secured via financial summary
  const fundsSecured = useFundsSecured(projectId, accessToken || undefined);
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
  const [siteAccessRequests, setSiteAccessRequests] = useState<SiteAccessRequest[]>([]);
  const [siteAccessData, setSiteAccessData] = useState<SiteAccessData | null>(null);
  const [siteAccessLoading, setSiteAccessLoading] = useState(false);
  const [siteAccessError, setSiteAccessError] = useState<string | null>(null);
  const [submittingSiteAccess, setSubmittingSiteAccess] = useState<string | null>(null);
  const [siteAccessForms, setSiteAccessForms] = useState<Record<string, {
    status: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied';
    visitScheduledFor?: string;
    visitScheduledAt?: string;
    reasonDenied?: string;
    addressFull?: string;
    unitNumber?: string;
    floorLevel?: string;
    accessDetails?: string;
    onSiteContactName?: string;
    onSiteContactPhone?: string;
  }>>({});
  const [siteVisits, setSiteVisits] = useState<SiteAccessVisit[]>([]);
  const [siteVisitLoading, setSiteVisitLoading] = useState(false);
  const [siteVisitError, setSiteVisitError] = useState<string | null>(null);
  const [submittingSiteVisit, setSubmittingSiteVisit] = useState<string | null>(null);
  const [siteVisitResponseNotes, setSiteVisitResponseNotes] = useState<Record<string, string>>({});
  const [locationDetailsForm, setLocationDetailsForm] = useState({
    addressFull: '',
    postalCode: '',
    unitNumber: '',
    floorLevel: '',
    propertyType: '',
    propertySize: '',
    propertyAge: '',
    accessDetails: '',
    existingConditions: '',
    specialRequirements: '',
    onSiteContactName: '',
    onSiteContactPhone: '',
    accessHoursDescription: '',
    desiredStartDate: '',
    photoUrls: '' as string,
  });
  const [submittingLocationDetails, setSubmittingLocationDetails] = useState(false);
  const [locationDetailsError, setLocationDetailsError] = useState<string | null>(null);
  const [locationDetailsSuccess, setLocationDetailsSuccess] = useState(false);

  // Tab & accordion state
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({
    'project-details': true,
    'schedule-contact': false,
    'progress-financials': false,
    'site-access-requests': true,
    'site-visit-proposals': false,
    'location-details': false,
    'bidding': true,
    'awarded-details': false,
  });

  const toggleAccordion = (id: string) => {
    setExpandedAccordions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Derived values
  const projectStatus = project?.status ?? 'pending';
  const awardedPro = project?.professionals?.find((pp) => pp.status === 'awarded');
  const isAwarded = projectStatus === 'awarded' || Boolean(awardedPro);
  const projectCostValue = Number(awardedPro?.quoteAmount || project?.approvedBudget || project?.budget || 0);
  const escrowValue = (awardedPro as any)?.invoice?.amount ?? (project as any)?.escrowAmount ?? 0;
  const paidValue = (project as any)?.paidAmount ?? (awardedPro as any)?.invoice?.paidAmount ?? 0;
  const refreshRequestTemplate =
    'Thanks for your quotation — we have received other offers and would like to give you the opportunity to rebid with your best price.';

  // Scroll to top on page load
  useEffect(() => {
    // Use setTimeout to ensure DOM is rendered before scrolling
    const scrollTimer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(scrollTimer);
  }, [projectId]);

  const parseJsonResponse = async <T,>(response: Response): Promise<T | null> => {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  };

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

      const data = await parseJsonResponse<ProjectDetail>(response);
      if (!data) {
        throw new Error('Empty response from server');
      }
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

  const fetchSiteAccessRequests = async () => {
    if (!accessToken || !projectId) return;
    setSiteAccessLoading(true);
    setSiteAccessError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${projectId}/site-access/requests`,
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
        throw new Error(data.message || 'Failed to load site access requests');
      }

      const data = await parseJsonResponse<{ requests?: SiteAccessRequest[]; siteAccessData?: SiteAccessData | null }>(response);
      if (!data) {
        throw new Error('Empty response from server');
      }
      setSiteAccessRequests(data.requests || []);
      setSiteAccessData(data.siteAccessData || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load site access requests';
      setSiteAccessError(message);
    } finally {
      setSiteAccessLoading(false);
    }
  };

  const fetchSiteVisits = async () => {
    if (!accessToken || !projectId) return;
    setSiteVisitLoading(true);
    setSiteVisitError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${projectId}/site-visits`,
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
        throw new Error(data.message || 'Failed to load site visits');
      }

      const data = await parseJsonResponse<{ visits?: SiteAccessVisit[] }>(response);
      if (!data) {
        throw new Error('Empty response from server');
      }
      setSiteVisits(data.visits || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load site visits';
      setSiteVisitError(message);
    } finally {
      setSiteVisitLoading(false);
    }
  };

  const handleRespondToSiteAccessRequest = async (requestId: string) => {
    if (!accessToken) return;
    const form = siteAccessForms[requestId];
    if (!form) return;

    if (form.status === 'approved_visit_scheduled' && !form.visitScheduledFor && !form.visitScheduledAt) {
      toast.error('Please select a visit date and time');
      return;
    }

    if (form.status === 'denied' && !form.reasonDenied) {
      toast.error('Please provide a reason for denial');
      return;
    }

    if (form.status !== 'denied' && !form.addressFull && !siteAccessData?.addressFull) {
      toast.error('Address is required to approve site access');
      return;
    }

    setSubmittingSiteAccess(requestId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/site-access-requests/${requestId}/respond`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: form.status,
            visitScheduledFor: form.visitScheduledFor || undefined,
            visitScheduledAt: form.visitScheduledAt || undefined,
            reasonDenied: form.reasonDenied || undefined,
            addressFull: form.addressFull || siteAccessData?.addressFull,
            unitNumber: form.unitNumber || siteAccessData?.unitNumber,
            floorLevel: form.floorLevel || siteAccessData?.floorLevel,
            accessDetails: form.accessDetails || siteAccessData?.accessDetails,
            onSiteContactName: form.onSiteContactName || siteAccessData?.onSiteContactName,
            onSiteContactPhone: form.onSiteContactPhone || siteAccessData?.onSiteContactPhone,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to respond to request');
      }

      toast.success('Response sent to the professional.');
      await fetchSiteAccessRequests();
      await fetchSiteVisits();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to respond to request';
      toast.error(message);
    } finally {
      setSubmittingSiteAccess(null);
    }
  };

  const handleRespondToSiteVisit = async (visitId: string, status: 'accepted' | 'declined') => {
    if (!accessToken) return;
    setSubmittingSiteVisit(visitId);
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
            responseNotes: siteVisitResponseNotes[visitId] || undefined,
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
      setSiteVisitResponseNotes((prev) => ({ ...prev, [visitId]: '' }));
      toast.success(status === 'accepted' ? 'Site visit accepted.' : 'Site visit declined.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to respond to site visit';
      setSiteVisitError(message);
    } finally {
      setSubmittingSiteVisit(null);
    }
  };

  const handleSubmitLocationDetails = async () => {
    if (!accessToken || !projectId) return;
    setSubmittingLocationDetails(true);
    setLocationDetailsError(null);
    setLocationDetailsSuccess(false);

    try {
      if (!locationDetailsForm.addressFull) {
        throw new Error('Address is required');
      }

      const response = await fetch(
        `${API_BASE_URL}/projects/${projectId}/location-details`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addressFull: locationDetailsForm.addressFull,
            postalCode: locationDetailsForm.postalCode || undefined,
            unitNumber: locationDetailsForm.unitNumber || undefined,
            floorLevel: locationDetailsForm.floorLevel || undefined,
            propertyType: locationDetailsForm.propertyType || undefined,
            propertySize: locationDetailsForm.propertySize || undefined,
            propertyAge: locationDetailsForm.propertyAge || undefined,
            accessDetails: locationDetailsForm.accessDetails || undefined,
            existingConditions: locationDetailsForm.existingConditions || undefined,
            specialRequirements: locationDetailsForm.specialRequirements
              ? locationDetailsForm.specialRequirements
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : undefined,
            onSiteContactName: locationDetailsForm.onSiteContactName || undefined,
            onSiteContactPhone: locationDetailsForm.onSiteContactPhone || undefined,
            accessHoursDescription: locationDetailsForm.accessHoursDescription || undefined,
            desiredStartDate: locationDetailsForm.desiredStartDate || undefined,
            photoUrls: locationDetailsForm.photoUrls
              ? locationDetailsForm.photoUrls
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to submit location details');
      }

      setLocationDetailsSuccess(true);
      toast.success('Location details submitted.');
      await fetchProject();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit location details';
      setLocationDetailsError(message);
    } finally {
      setSubmittingLocationDetails(false);
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
    fetchSiteAccessRequests();
    fetchSiteVisits();
  }, [isLoggedIn, accessToken, projectId, router]);

  useEffect(() => {
    if (!siteAccessData) return;
    setLocationDetailsForm((prev) => ({
      ...prev,
      addressFull: prev.addressFull || siteAccessData.addressFull || '',
      unitNumber: prev.unitNumber || siteAccessData.unitNumber || '',
      floorLevel: prev.floorLevel || siteAccessData.floorLevel || '',
      accessDetails: prev.accessDetails || siteAccessData.accessDetails || '',
      onSiteContactName: prev.onSiteContactName || siteAccessData.onSiteContactName || '',
      onSiteContactPhone: prev.onSiteContactPhone || siteAccessData.onSiteContactPhone || '',
    }));
  }, [siteAccessData]);

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

        const data = await parseJsonResponse<{ messages?: Message[] }>(res);
        if (!data) {
          throw new Error('Empty response from server');
        }
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
        const data = await parseJsonResponse<{ assist?: { id?: string } }>(res);
        const assist = data?.assist;
        if (assist?.id) {
          setAssistRequestId(assist.id);
          // Fetch messages
          const mres = await fetch(`${API_BASE_URL}/assist-requests/${encodeURIComponent(assist.id)}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (mres.ok) {
            const msgs = await parseJsonResponse<any>(mres);
            const normalized = Array.isArray(msgs) ? msgs : (msgs?.messages || []);
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
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !selectedProfessional || !accessToken) return;

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
          body: JSON.stringify({ 
            content: newMessage.trim(),
            attachments: pendingAttachments,
          }),
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
      setPendingAttachments([]);
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
      <>
        <Toaster position="top-right" />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-gray-600">Loading project...</p>
          </div>
        </div>
      </>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  // Values computed above in derived section

  if (error || !project) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-6 max-w-md w-full text-center">
            <p className="text-red-800 font-medium">{error || 'Project not found'}</p>
            <Link href="/projects" className="mt-4 inline-block text-blue-600 hover:underline">
              ← Back to projects
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href="/projects" className="text-sm text-blue-600 hover:underline">
              ← Back to projects
            </Link>
          </div>

        {/* Project Info & Tab Navigation */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className={`px-5 py-4 text-white rounded-t-xl ${
            projectStatus === 'withdrawn'
              ? 'bg-gradient-to-r from-slate-400 to-slate-300'
              : 'bg-gradient-to-r from-slate-900 to-slate-800'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h1 className={`text-2xl font-bold ${
                  projectStatus === 'withdrawn' ? 'text-slate-700' : ''
                }`}>
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
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    projectStatusBadge[projectStatus] || 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {projectStatus.replace('_', ' ')}
                </span>
                {projectStatus === 'awarded' && project.professionals?.some((pp) => pp.status === 'awarded') && (
                  <span className="text-xs font-medium text-slate-300">
                    {project.professionals.find((pp) => pp.status === 'awarded')?.professional.fullName || 
                     project.professionals.find((pp) => pp.status === 'awarded')?.professional.businessName || 
                     'Professional'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {(projectStatus === 'withdrawn' || (!project.professionals?.some((pp) => pp.status === 'awarded') && projectStatus !== 'withdrawn')) && (
            <div className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-200">
              <div className="flex items-center gap-3">
                {projectStatus === 'withdrawn' && (
                  <span className="text-sm text-slate-600">Project withdrawn from bidding.</span>
                )}
              </div>
              {!project.professionals?.some((pp) => pp.status === 'awarded') && projectStatus !== 'withdrawn' && (
                <button
                  onClick={() => setShowWithdrawConfirm(true)}
                  disabled={withdrawing}
                  className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {withdrawing ? 'Withdrawing…' : 'Withdraw Project'}
                </button>
              )}
            </div>
          )}

          {/* Tab Navigation */}
          <ProjectTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Tab Content - Overview */}
        {activeTab === 'overview' && project && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <OverviewTab
              project={project}
              expandedAccordions={expandedAccordions}
              onToggleAccordion={toggleAccordion}
              accessToken={accessToken || ''}
              fundsSecured={fundsSecured}
              onScheduleUpdate={async (data) => {
                const res = await fetch(`${API_BASE_URL}/projects/${projectId}/schedule`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error('Failed to update schedule');
                const updated = await res.json();
                setProject((prev) => prev ? { ...prev, ...updated.project } : null);
              }}
              onContactUpdate={async (data) => {
                const res = await fetch(`${API_BASE_URL}/projects/${projectId}/contractor-contact`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error('Failed to update contact');
                const updated = await res.json();
                setProject((prev) => prev ? { ...prev, ...updated.project } : null);
              }}
              onPayInvoice={handlePayInvoice}
              isUpdatingSchedule={updatingSchedule}
              isUpdatingContact={updatingContact}
              isPayingInvoice={payingInvoice}
            />
          </div>
        )}

        {/* Tab Content - Site Access */}
        {activeTab === 'site-access' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <SiteAccessTab
              siteAccessRequests={siteAccessRequests}
              siteAccessData={siteAccessData}
              siteVisits={siteVisits}
              expandedAccordions={expandedAccordions}
              onToggleAccordion={toggleAccordion}
              onRespondToRequest={async (requestId) => {
                await handleRespondToSiteAccessRequest(requestId);
              }}
              onRespondToVisit={async (visitId, status) => {
                await handleRespondToSiteVisit(visitId, status);
              }}
              onSubmitLocationDetails={handleSubmitLocationDetails}
              siteAccessLoading={siteAccessLoading}
              siteAccessError={siteAccessError}
              siteVisitLoading={siteVisitLoading}
              siteVisitError={siteVisitError}
              submittingSiteAccess={submittingSiteAccess}
              submittingSiteVisit={submittingSiteVisit}
              siteAccessForms={siteAccessForms}
              onUpdateSiteAccessForm={(requestId, patch) => {
                setSiteAccessForms((prev) => ({
                  ...prev,
                  [requestId]: { ...prev[requestId], ...patch },
                }));
              }}
              siteVisitResponseNotes={siteVisitResponseNotes}
              onUpdateSiteVisitResponseNotes={(visitId, notes) => {
                setSiteVisitResponseNotes((prev) => ({
                  ...prev,
                  [visitId]: notes,
                }));
              }}
              locationDetailsForm={locationDetailsForm}
              onUpdateLocationDetailsForm={(patch) => {
                setLocationDetailsForm((prev) => ({
                  ...prev,
                  ...patch,
                }));
              }}
              isSubmittingLocationDetails={submittingLocationDetails}
              locationDetailsError={locationDetailsError}
            />
          </div>
        )}

          {/* Tab Content - Professionals */}
          {activeTab === 'professionals' && project && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
              <ProfessionalsTab
                project={project}
                professionals={project.professionals || []}
                expandedAccordions={expandedAccordions}
                onToggleAccordion={toggleAccordion}
                accessToken={accessToken || ''}
                onAwarded={async () => {
                  const res = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                  });
                  if (res.ok) {
                    const updated = await res.json();
                    setProject(updated.project);
                  }
                }}
                onActionBusy={setActionBusy}
                actionBusy={actionBusy}
              />
            </div>
          )}

          {/* Tab Content - Media */}
          {activeTab === 'media' && project && (
            <MediaTab
              photos={(project as any).photos || []}
              onPhotoNoteUpdate={handleSaveImageNote}
              isLoading={loading}
            />
          )}

        {/* Tab Content - Chat */}
        {activeTab === 'chat' && project?.professionals && project.professionals.some((pp) => pp.status === 'awarded') && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <ChatTab
              projectId={projectId}
              professionals={project.professionals}
              accessToken={accessToken || ''}
              selectedProfessional={selectedProfessional}
              onSelectProfessional={setSelectedProfessional}
              viewingAssistChat={viewingAssistChat}
              onViewingAssistChatChange={setViewingAssistChat}
              assistRequestId={assistRequestId}
              messages={messages}
              newMessage={newMessage}
              onNewMessageChange={setNewMessage}
              onSendMessage={handleSendMessage}
              loadingMessages={loadingMessages}
              sending={sending}
              messageError={messageError}
              pendingAttachments={pendingAttachments}
              onPendingAttachmentsChange={setPendingAttachments}
              assistMessages={assistMessages}
              assistNewMessage={assistNewMessage}
              onAssistNewMessageChange={setAssistNewMessage}
              onSendAssistMessage={handleSendAssistMessage}
              assistLoading={assistLoading}
              assistSending={assistSending}
              assistError={assistError}
            />
          </div>
        )}

          {/* 🔴 REDUNDANT - Site Access Requests moved to Site Access Tab - Can be removed after full migration */}
          {false && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Site Access Requests</h2>
                <p className="text-sm text-slate-600">Approve or deny professional requests for site access.</p>
              </div>
              <button
                type="button"
                onClick={fetchSiteAccessRequests}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            {siteAccessError && (
              <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {siteAccessError}
              </div>
            )}

            {siteAccessLoading ? (
              <p className="mt-4 text-sm text-slate-600">Loading requests...</p>
            ) : siteAccessRequests.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No site access requests yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {siteAccessRequests.map((request) => {
                  const displayName = request.professional.fullName || request.professional.businessName || request.professional.email || 'Professional';
                  const form = siteAccessForms[request.id] || {
                    status: 'approved_no_visit' as const,
                    addressFull: siteAccessData?.addressFull || '',
                    unitNumber: siteAccessData?.unitNumber || '',
                    floorLevel: siteAccessData?.floorLevel || '',
                    accessDetails: siteAccessData?.accessDetails || '',
                    onSiteContactName: siteAccessData?.onSiteContactName || '',
                    onSiteContactPhone: siteAccessData?.onSiteContactPhone || '',
                    visitScheduledAt: '',
                  };

                  const updateForm = (patch: Partial<typeof form>) => {
                    setSiteAccessForms((prev) => ({
                      ...prev,
                      [request.id]: { ...form, ...patch },
                    }));
                  };

                  return (
                    <div key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{displayName}</p>
                          <p className="text-xs text-slate-500">
                            Requested {new Date(request.requestedAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 capitalize">
                          {request.status.replace('_', ' ')}
                        </span>
                      </div>

                      {request.status === 'pending' ? (
                        <div className="mt-4 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600">Address *</label>
                              <input
                                value={form.addressFull || ''}
                                onChange={(e) => updateForm({ addressFull: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Full address"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600">Unit / Floor</label>
                              <div className="mt-1 grid gap-2 grid-cols-2">
                                <input
                                  value={form.unitNumber || ''}
                                  onChange={(e) => updateForm({ unitNumber: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  placeholder="Unit"
                                />
                                <input
                                  value={form.floorLevel || ''}
                                  onChange={(e) => updateForm({ floorLevel: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  placeholder="Floor"
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600">Access Details</label>
                            <input
                              value={form.accessDetails || ''}
                              onChange={(e) => updateForm({ accessDetails: e.target.value })}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Entry, parking, intercom, etc."
                            />
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600">On-site Contact</label>
                              <input
                                value={form.onSiteContactName || ''}
                                onChange={(e) => updateForm({ onSiteContactName: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Name"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600">Contact Phone</label>
                              <input
                                value={form.onSiteContactPhone || ''}
                                onChange={(e) => updateForm({ onSiteContactPhone: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Phone"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600">Decision</label>
                              <select
                                value={form.status}
                                onChange={(e) => updateForm({ status: e.target.value as typeof form.status })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              >
                                <option value="approved_no_visit">Approve (no visit required)</option>
                                <option value="approved_visit_scheduled">Approve with visit schedule</option>
                                <option value="denied">Deny request</option>
                              </select>
                            </div>
                            {form.status === 'approved_visit_scheduled' && (
                              <div>
                                <label className="block text-xs font-semibold text-slate-600">Visit Date & Time</label>
                                <input
                                  type="datetime-local"
                                  value={form.visitScheduledAt || ''}
                                  onChange={(e) => updateForm({ visitScheduledAt: e.target.value })}
                                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                />
                              </div>
                            )}
                          </div>

                          {form.status === 'denied' && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-600">Reason for denial</label>
                              <input
                                value={form.reasonDenied || ''}
                                onChange={(e) => updateForm({ reasonDenied: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Explain why"
                              />
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRespondToSiteAccessRequest(request.id)}
                              disabled={submittingSiteAccess === request.id}
                              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {submittingSiteAccess === request.id ? 'Sending...' : 'Send Response'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-600">
                          {request.status === 'denied' && request.reasonDenied
                            ? `Denied: ${request.reasonDenied}`
                            : 'Response recorded.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* 🔴 REDUNDANT - Site Visit Requests moved to Site Access Tab - Can be removed after full migration */}
          {false && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Site Visit Requests</h2>
                <p className="text-sm text-slate-600">
                  Approve or decline proposed site visits from professionals.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchSiteVisits}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            {siteVisitError && (
              <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {siteVisitError}
              </div>
            )}

            {siteVisitLoading ? (
              <p className="mt-4 text-sm text-slate-600">Loading site visits...</p>
            ) : siteVisits.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No site visits proposed yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {siteVisits.map((visit) => {
                  const professionalName =
                    visit.professional.businessName ||
                    visit.professional.fullName ||
                    visit.professional.email ||
                    'Professional';
                  const isPending = visit.status === 'proposed';
                  const proposedByProfessional = visit.proposedByRole === 'professional';

                  return (
                    <div key={visit.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{professionalName}</p>
                          <p className="text-xs text-slate-500">
                            Proposed {new Date(visit.proposedAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                          {visit.status.replace('_', ' ')}
                        </span>
                      </div>

                      {visit.notes && (
                        <p className="mt-2 text-xs text-slate-600">Notes: {visit.notes}</p>
                      )}

                      {visit.responseNotes && (
                        <p className="mt-2 text-xs text-slate-600">Response: {visit.responseNotes}</p>
                      )}

                      {isPending && proposedByProfessional && (
                        <div className="mt-3 space-y-2">
                          <input
                            value={siteVisitResponseNotes[visit.id] || ''}
                            onChange={(e) =>
                              setSiteVisitResponseNotes((prev) => ({
                                ...prev,
                                [visit.id]: e.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                            placeholder="Add a response note (optional)"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleRespondToSiteVisit(visit.id, 'accepted')}
                              disabled={submittingSiteVisit === visit.id}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {submittingSiteVisit === visit.id ? 'Sending...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespondToSiteVisit(visit.id, 'declined')}
                              disabled={submittingSiteVisit === visit.id}
                              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              {submittingSiteVisit === visit.id ? 'Sending...' : 'Decline'}
                            </button>
                          </div>
                        </div>
                      )}

                      {isPending && !proposedByProfessional && (
                        <p className="mt-2 text-xs text-slate-600">
                          Awaiting professional response to your proposed visit.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* 🔴 REDUNDANT - Location Details moved to Site Access Tab - Can be removed after full migration */}
          {false && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Project Location Details</h2>
                <p className="text-sm text-slate-600">
                  Provide formal site details once escrow is confirmed.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${fundsSecured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                {fundsSecured ? 'Escrow confirmed' : 'Awaiting escrow'}
              </span>
            </div>

            {!fundsSecured && (
              <p className="mt-4 text-sm text-slate-600">
                Location details will be required after escrow is confirmed.
              </p>
            )}

            {fundsSecured && project?.locationDetailsStatus && project?.locationDetailsStatus !== 'pending' && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Location details submitted (status: {project?.locationDetailsStatus}).
              </div>
            )}

            {fundsSecured && (!project?.locationDetailsStatus || project?.locationDetailsStatus === 'pending') && (
              <div className="mt-4 space-y-4">
                {locationDetailsError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {locationDetailsError}
                  </div>
                )}
                {locationDetailsSuccess && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Location details submitted successfully.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Address *</label>
                    <input
                      value={locationDetailsForm.addressFull}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, addressFull: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Postal Code</label>
                    <input
                      value={locationDetailsForm.postalCode}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, postalCode: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Unit</label>
                    <input
                      value={locationDetailsForm.unitNumber}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, unitNumber: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Floor</label>
                    <input
                      value={locationDetailsForm.floorLevel}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, floorLevel: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Property Type</label>
                    <input
                      value={locationDetailsForm.propertyType}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, propertyType: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Residential, Commercial..."
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Property Size</label>
                    <input
                      value={locationDetailsForm.propertySize}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, propertySize: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. 1200 sq ft"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Property Age</label>
                    <input
                      value={locationDetailsForm.propertyAge}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, propertyAge: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600">Access Details</label>
                  <input
                    value={locationDetailsForm.accessDetails}
                    onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, accessDetails: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600">Existing Conditions</label>
                  <textarea
                    value={locationDetailsForm.existingConditions}
                    onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, existingConditions: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600">Special Requirements (comma-separated)</label>
                  <input
                    value={locationDetailsForm.specialRequirements}
                    onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, specialRequirements: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">On-site Contact</label>
                    <input
                      value={locationDetailsForm.onSiteContactName}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, onSiteContactName: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Contact Phone</label>
                    <input
                      value={locationDetailsForm.onSiteContactPhone}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, onSiteContactPhone: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Access Hours</label>
                    <input
                      value={locationDetailsForm.accessHoursDescription}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, accessHoursDescription: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Desired Start Date</label>
                    <input
                      type="date"
                      value={locationDetailsForm.desiredStartDate}
                      onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, desiredStartDate: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600">Photo URLs (comma-separated)</label>
                  <input
                    value={locationDetailsForm.photoUrls}
                    onChange={(e) => setLocationDetailsForm({ ...locationDetailsForm, photoUrls: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSubmitLocationDetails}
                    disabled={submittingLocationDetails}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {submittingLocationDetails ? 'Submitting...' : 'Submit Location Details'}
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {/* 🔴 REDUNDANT - Bidding moved to Professionals Tab - Can be removed after full migration */}
          {false && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Bidding</h2>
                  <p className="text-sm text-slate-600">Review quotes from invited professionals</p>
                </div>
                <Link
                  href={`/professionals?projectId=${projectId}`}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
                >
                  + Invite More
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {project?.professionals?.map((pp) => {
                  const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                  const isSelected = selectedProfessional?.id === pp.id;
                  return (
                    <div 
                      key={pp.id} 
                      onClick={() => {
                        setSelectedProfessional(pp);
                        setViewingAssistChat(false);
                      }}
                      className={`rounded-lg border p-4 transition cursor-pointer ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50 shadow-md' 
                          : 'border-slate-200 bg-slate-50 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {displayName[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">{displayName}</p>
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-200 text-slate-800 capitalize mt-1">
                            {pp.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      {pp.quoteAmount && (
                        <div className="mb-3 p-2 rounded-md bg-blue-50 border border-blue-100">
                          <p className="text-xs text-blue-700 font-medium">Quote Price</p>
                          <p className="text-lg font-bold text-blue-900">${typeof pp.quoteAmount === 'number' ? pp.quoteAmount.toLocaleString() : pp.quoteAmount}</p>
                        </div>
                      )}
                      {pp.quoteAmount && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProfessional(pp);
                              setViewingAssistChat(false);
                              setNewMessage(refreshRequestTemplate);
                              requestAnimationFrame(() => messageInputRef.current?.focus());
                            }}
                            className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                            title="Ask for a better price"
                          >
                            🔄 Refresh
                          </button>
                          {pp.status !== 'declined' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setActionBusy('accept');
                                try {
                                  const res = await fetch(
                                    `${API_BASE_URL}/projects/${projectId}/award/${pp.professionalId}`,
                                    {
                                      method: 'POST',
                                      headers: {
                                        Authorization: `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json',
                                      },
                                    },
                                  );

                                  if (!res.ok) {
                                    const errData = await res.json();
                                    throw new Error(errData.message || 'Failed to award quote');
                                  }

                                  toast.success('Quote awarded successfully!');
                                  setMessageError(null);
                                  setNewMessage('');
                                  await fetchProject();
                                } catch (err) {
                                  const msg = err instanceof Error ? err.message : 'Failed to award quote';
                                  setMessageError(msg);
                                  toast.error(msg);
                                } finally {
                                  setActionBusy(null);
                                }
                              }}
                              disabled={actionBusy === 'accept'}
                              className="flex-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                              title="Accept this quote"
                            >
                              {actionBusy === 'accept' ? '…' : '✓ Accept'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              setActionBusy('reject');
                              try {
                                const res = await fetch(
                                  `${API_BASE_URL}/professional/projects/${pp.id}/reject-quote`,
                                  {
                                    method: 'POST',
                                    headers: {
                                      Authorization: `Bearer ${accessToken}`,
                                      'Content-Type': 'application/json',
                                    },
                                  },
                                );

                                if (!res.ok) {
                                  const errData = await res.json();
                                  throw new Error(errData.message || 'Failed to reject quote');
                                }

                                toast.success('Quote rejected');
                                await fetchProject();
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : 'Failed to reject quote';
                                toast.error(msg);
                              } finally {
                                setActionBusy(null);
                              }
                            }}
                            disabled={actionBusy === 'reject'}
                            className="rounded-md bg-rose-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                            title="Reject this quote"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Awarded Details - REMOVED, combined with new awarded chat panel above */}

          {/* Professionals Summary Table - REMOVED, replaced by Professionals Tab */}

          {/* 🔴 REDUNDANT - Professionals & Messaging moved to Chat Tab - Can be removed after full migration */}
          {false && (
        <div>
            {/* Messages Panel - Full Width */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {viewingAssistChat ? 'Fitout Hub Assistance' : (selectedProfessional
                        ? `Chat with ${selectedProfessional?.professional?.fullName || selectedProfessional?.professional?.businessName || selectedProfessional?.professional?.email}`
                        : 'Select a professional to chat')}
                    </h3>
                    {viewingAssistChat && (
                      <p className="text-xs text-slate-600 mt-1">
                        Get help from Fitout Hub experts
                      </p>
                    )}
                    {!viewingAssistChat && selectedProfessional && (
                      <p className="text-xs text-slate-600 mt-1">
                        {selectedProfessional?.professional?.fullName || selectedProfessional?.professional?.businessName || selectedProfessional?.professional?.email}
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
                      ref={messageInputRef}
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

        {/* 🔴 REDUNDANT - Chat functionality moved to Chat tab */}
        {false && (
          <>
            {/* Awarded Project Chat Panel - Show when project is awarded */}
            {project?.professionals && project?.professionals?.some((pp) => pp.status === 'awarded') && (
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
                      selectedProfessional ? `professional-${selectedProfessional?.id}` : 
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
                        const prof = project?.professionals?.find(p => p.id === profId);
                        if (prof) {
                          setSelectedProfessional(prof);
                          setViewingAssistChat(false);
                        }
                      }
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="project">Project (All professionals)</option>
                    {project?.professionals?.map((pp) => {
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
                        <button
                          onClick={() => setSelectedProfessional(null)}
                          className="text-amber-600 hover:text-amber-900 ml-auto"
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
                                {msg.content && <p>{msg.content}</p>}
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div className={`${msg.content ? 'mt-2' : ''} flex flex-wrap gap-2`}>
                                    {msg.attachments.map((att, i) => (
                                      <a
                                        key={i}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block"
                                      >
                                        <img
                                          src={att.url}
                                          alt={att.filename}
                                          className="w-24 h-24 rounded border border-slate-300 hover:opacity-80 transition object-cover"
                                          title={att.filename}
                                        />
                                      </a>
                                    ))}
                                  </div>
                                )}
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
                        <div className="space-y-3">
                          {/* Image uploader */}
                          <div>
                            <ChatImageUploader
                              onImagesUploaded={(images) => setPendingAttachments((prev) => [...prev, ...images])}
                              maxImages={3}
                              disabled={sending || loadingMessages}
                              projectId={projectId}
                            />
                          </div>

                          {/* Show pending attachments */}
                          {pendingAttachments.length > 0 && (
                            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-xs text-slate-600 mb-2 font-medium">
                                {pendingAttachments.length} image{pendingAttachments.length > 1 ? 's' : ''} ready to send
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {pendingAttachments.map((att, i) => (
                                  <div key={i} className="relative group">
                                    <img 
                                      src={att.url} 
                                      alt={att.filename} 
                                      className="w-16 h-16 object-cover rounded border border-slate-300"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs hover:bg-red-600 shadow-md"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

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
                              disabled={(!newMessage.trim() && pendingAttachments.length === 0) || sending}
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
              </div>
            </div>
          </div>
        )}
          </>
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
