'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { StatusPill } from './status-pill';

interface FinancialActionItem {
  id: string;
  type: string;
  description: string;
  amount: string;
  status: string;
  projectId: string;
  projectName: string;
  createdAt: string;
}

interface UnreadMessageGroup {
  projectId: string;
  projectName: string;
  unreadCount: number;
  latestMessage: {
    content: string;
    createdAt: string;
    senderType: string;
  };
  chatType: 'project-professional' | 'project-general' | 'assist' | 'private-foh';
  threadId?: string;
}

interface UpdatesSummary {
  financialActions: FinancialActionItem[];
  financialCount: number;
  unreadMessages: UnreadMessageGroup[];
  unreadCount: number;
  totalCount: number;
}

interface UpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function UpdatesModal({ isOpen, onClose, onRefresh }: UpdatesModalProps) {
  const router = useRouter();
  const { accessToken: clientToken } = useAuth();
  const { accessToken: profToken } = useProfessionalAuth();
  const [data, setData] = useState<UpdatesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Use whichever token is available
  const token = clientToken || profToken;

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/updates/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const summary = await response.json();
        setData(summary);
      }
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchData();
    }
  }, [isOpen, token]);

  const handleApprovePayment = async (transactionId: string) => {
    setActionLoading(transactionId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/financial/${transactionId}/approve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        await fetchData();
        onRefresh();
      } else {
        alert('Failed to approve payment');
      }
    } catch (error) {
      console.error('Failed to approve payment:', error);
      alert('Failed to approve payment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayment = async (transactionId: string) => {
    setActionLoading(transactionId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/financial/${transactionId}/reject`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        await fetchData();
        onRefresh();
      } else {
        alert('Failed to reject payment');
      }
    } catch (error) {
      console.error('Failed to reject payment:', error);
      alert('Failed to reject payment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmDeposit = async (transactionId: string) => {
    setActionLoading(transactionId);
    try {
      const token = localStorage.getItem('token');
      const projectId = data?.financialActions.find((a) => a.id === transactionId)?.projectId;
      
      if (!projectId) return;

      const response = await fetch(
        `${API_BASE_URL}/projects/${projectId}/confirm-deposit`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transactionId }),
        }
      );

      if (response.ok) {
        await fetchData();
        onRefresh();
      } else {
        alert('Failed to confirm deposit');
      }
    } catch (error) {
      console.error('Failed to confirm deposit:', error);
      alert('Failed to confirm deposit');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMessageClick = (group: UnreadMessageGroup) => {
    // Navigate to the appropriate chat and mark as read
    if (group.chatType === 'private-foh') {
      router.push('/support');
    } else if (group.chatType === 'assist') {
      router.push(`/projects/${group.projectId}?tab=assist`);
    } else {
      router.push(`/projects/${group.projectId}?tab=chat`);
    }
    onClose();
  };

  const handleMarkAllRead = async () => {
    // This would require backend support for bulk marking
    // For now, just close and let individual clicks handle it
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-strong">Your Updates</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-sub">Loading...</div>
          ) : !data || data.totalCount === 0 ? (
            <div className="text-center py-12 text-sub">No updates at this time</div>
          ) : (
            <div className="space-y-8">
              {/* Financial Actions */}
              {data.financialActions.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-strong mb-4 flex items-center gap-2">
                    💰 Financial Actions
                    <span className="text-sm font-normal text-sub">
                      ({data.financialCount})
                    </span>
                  </h3>
                  <div className="space-y-3">
                    {data.financialActions.map((action) => (
                      <div
                        key={action.id}
                        className="border border-border rounded-lg p-4 bg-surface hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-strong">{action.projectName}</h4>
                              <StatusPill status={action.status} />
                            </div>
                            <p className="text-sm text-sub mb-1">{action.description}</p>
                            <p className="text-lg font-semibold text-action">HK${action.amount}</p>
                            <p className="text-xs text-sub mt-1">
                              {new Date(action.createdAt).toLocaleString()}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            {action.type === 'advance_payment_request' && action.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprovePayment(action.id)}
                                  disabled={actionLoading === action.id}
                                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                                >
                                  {actionLoading === action.id ? 'Processing...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleRejectPayment(action.id)}
                                  disabled={actionLoading === action.id}
                                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {action.type === 'escrow_deposit_request' && action.status === 'awaiting_confirmation' && (
                              <button
                                onClick={() => handleConfirmDeposit(action.id)}
                                disabled={actionLoading === action.id}
                                className="px-4 py-2 bg-action text-white rounded hover:bg-action-hover disabled:opacity-50 text-sm font-medium"
                              >
                                {actionLoading === action.id ? 'Processing...' : 'Confirm Paid'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unread Messages */}
              {data.unreadMessages.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-strong mb-4 flex items-center gap-2">
                    💬 Unread Messages
                    <span className="text-sm font-normal text-sub">
                      ({data.unreadCount} total)
                    </span>
                  </h3>
                  <div className="space-y-3">
                    {data.unreadMessages.map((group, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleMessageClick(group)}
                        className="border border-border rounded-lg p-4 bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-strong">{group.projectName}</h4>
                              <span className="px-2 py-0.5 bg-action text-white rounded-full text-xs font-semibold">
                                {group.unreadCount}
                              </span>
                            </div>
                            <p className="text-sm text-sub line-clamp-2">
                              {group.latestMessage.content}
                            </p>
                            <p className="text-xs text-sub mt-1">
                              {new Date(group.latestMessage.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <button className="text-action hover:text-action-hover font-medium text-sm">
                            View →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {data && data.totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface">
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-action hover:text-action-hover font-medium"
            >
              Mark all messages as read
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-action text-white rounded hover:bg-action-hover font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
