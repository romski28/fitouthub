'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { toast } from 'react-hot-toast';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';

interface ActivityLog {
  id: string;
  actorName: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  status: 'success' | 'info' | 'warning' | 'danger';
  createdAt: string;
  user?: { firstName: string; surname: string; email: string };
  professional?: { fullName: string; email: string };
}

const statusStyles: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
};

const actionLabels: Record<string, string> = {
  account_created: 'Account Created',
  login: 'Logged In',
  logout: 'Logged Out',
  login_failed: 'Login Failed',
  password_changed: 'Password Changed',
  profile_updated: 'Updated Profile',
};

export default function ActivityLogPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadLogs();
  }, [page]);

  const loadLogs = async () => {
    if (!accessToken) {
      // Try without token first for debugging
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/activity-log?page=${page}&limit=50`);

        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);

        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.pagination.total);
      } catch (err) {
        console.error('Activity log error:', err);
        toast.error('Failed to load activity log');
      } finally {
        setLoading(false);
      }
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/activity-log?page=${page}&limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.pagination.total);
    } catch (err) {
      toast.error('Failed to load activity log');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 0) return 'Today, ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday, ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Activity Log</h1>
        <p className="mt-2 text-slate-600">
          Audit trail of platform activity including logins, account creation, and system events.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
            <p className="text-sm text-slate-600">{total} total events logged</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
            <p className="mt-4 text-slate-600">Loading activity log...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            No activity logged yet
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {logs.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-2 w-2 rounded-full ${item.status === 'success' ? 'bg-emerald-500' : item.status === 'warning' ? 'bg-amber-500' : item.status === 'danger' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
                      <span className="font-semibold">{item.actorName}</span>
                      <span className="text-slate-500">{actionLabels[item.action] || item.action}</span>
                      {item.resource && item.resourceId && (
                        <span className="text-slate-700">· {item.resource}</span>
                      )}
                    </div>
                    {item.details && (
                      <p className="text-xs text-slate-600 mt-0.5">{item.details}</p>
                    )}
                    <p className="text-xs text-slate-500">{formatTimestamp(item.createdAt)}</p>
                  </div>
                </div>
                <span className={`self-start rounded-full px-2 py-1 text-xs font-medium ${statusStyles[item.status]}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
