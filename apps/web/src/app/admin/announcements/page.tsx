'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type Announcement = {
  id: string;
  title?: string | null;
  content: string;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedPreviousId, setSelectedPreviousId] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/');
    }
  }, [user, router]);

  const loadItems = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/announcements`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load announcements');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load announcements';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (user?.role === 'admin' && accessToken) {
      loadItems();
    }
  }, [user, accessToken, loadItems]);

  const activeItem = useMemo(() => items.find((item) => item.isActive) ?? null, [items]);

  const handleUsePrevious = () => {
    const selected = items.find((item) => item.id === selectedPreviousId);
    if (!selected) return;
    setTitle(selected.title || '');
    setContent(selected.content || '');
  };

  const handleCreate = async () => {
    if (!accessToken) return;
    if (!content.trim()) {
      alert('Ticker text is required.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/announcements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim() || undefined,
          content: content.trim(),
          isActive: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to publish ticker text');
      }

      setTitle('');
      setContent('');
      setSelectedPreviousId('');
      await loadItems();
      alert('Ticker text published.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish ticker text';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/${id}/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to activate ticker text');
      }
      await loadItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to activate ticker text';
      alert(message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-lg text-slate-700">Loading announcements…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-5xl mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Home Ticker Management</h1>
          <p className="mt-2 text-slate-600">Edit and publish ticker text shown on the public home page (logged-out users only).</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Publish New Ticker Text</h2>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Load previous text</label>
              <select
                value={selectedPreviousId}
                onChange={(e) => setSelectedPreviousId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select previous announcement…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title?.trim() || item.content.slice(0, 80)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleUsePrevious}
              disabled={!selectedPreviousId}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              Use in editor
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Label (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New Feature"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ticker text</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Enter announcement text shown in the home ticker..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !content.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Publishing…' : 'Publish and set active'}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">History</h2>
            {activeItem && (
              <p className="text-sm text-emerald-700 font-medium">
                Active: {activeItem.title?.trim() || activeItem.content.slice(0, 60)}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-slate-600">No ticker entries yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{item.title?.trim() || 'Untitled announcement'}</p>
                      {item.isActive && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                      )}
                    </div>
                    {!item.isActive && (
                      <button
                        type="button"
                        onClick={() => handleActivate(item.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Set active
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.content}</p>
                  <p className="mt-2 text-xs text-slate-500">Created: {new Date(item.createdAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
