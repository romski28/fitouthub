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

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/login');
      return;
    }

    if (!isLoggedIn || !accessToken || !projectId) {
      return;
    }

    const fetchProject = async () => {
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
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load project';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

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
              <div className="p-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    <span className="font-semibold text-emerald-900">Start Date:</span>
                    <span className="text-emerald-800">{project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    <span className="font-semibold text-emerald-900">End Date:</span>
                    <span className="text-emerald-800">{project.endDate ? new Date(project.endDate).toLocaleDateString() : 'Not set'}</span>
                  </div>
                </div>

                {(() => {
                  const awarded = project.professionals?.find((pp) => pp.status === 'awarded');
                  const displayName = awarded?.professional.fullName || awarded?.professional.businessName || awarded?.professional.email || '—';
                  const phone = project.contractorContactPhone || awarded?.professional.phone || '—';
                  const email = project.contractorContactEmail || awarded?.professional.email || '—';
                  const name = project.contractorContactName || displayName;
                  return (
                    <div className="rounded-md bg-white px-3 py-3 text-sm border border-emerald-200">
                      <p className="font-semibold text-emerald-900 mb-1">Contractor Contact</p>
                      <div className="grid gap-2 md:grid-cols-3 text-emerald-800">
                        <div><span className="font-medium">Name:</span> {name}</div>
                        <div><span className="font-medium">Phone:</span> {phone}</div>
                        <div><span className="font-medium">Email:</span> {email}</div>
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
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Invited Professionals</h2>
              <p className="text-sm text-slate-600">Click a row to open the chat with that professional.</p>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 text-center">
            No professionals assigned to this project yet.
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
