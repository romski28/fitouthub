'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type HomeRailCard = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  displayOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  id: '',
  title: '',
  description: '',
  imageUrl: '',
  ctaLabel: '',
  ctaHref: '#project-prompt',
  displayOrder: 100,
  isActive: true,
  startsAt: '',
  endsAt: '',
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<HomeRailCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
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
      const res = await fetch(`${API_BASE_URL}/announcements/home-rail/admin`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to load home rail cards');
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load home rail cards';
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

  const activeCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);

  const resetForm = () => {
    setEditingId(null);
    setSelectedPreviousId('');
    setForm(emptyForm);
  };

  const handleUsePrevious = () => {
    const selected = items.find((item) => item.id === selectedPreviousId);
    if (!selected) return;
    setEditingId(null);
    setForm({
      id: `${selected.id}-copy`,
      title: selected.title,
      description: selected.description,
      imageUrl: selected.imageUrl,
      ctaLabel: selected.ctaLabel,
      ctaHref: selected.ctaHref,
      displayOrder: selected.displayOrder,
      isActive: selected.isActive,
      startsAt: selected.startsAt ? selected.startsAt.slice(0, 16) : '',
      endsAt: selected.endsAt ? selected.endsAt.slice(0, 16) : '',
    });
  };

  const editCard = (card: HomeRailCard) => {
    setEditingId(card.id);
    setSelectedPreviousId('');
    setForm({
      id: card.id,
      title: card.title,
      description: card.description,
      imageUrl: card.imageUrl,
      ctaLabel: card.ctaLabel,
      ctaHref: card.ctaHref,
      displayOrder: card.displayOrder,
      isActive: card.isActive,
      startsAt: card.startsAt ? card.startsAt.slice(0, 16) : '',
      endsAt: card.endsAt ? card.endsAt.slice(0, 16) : '',
    });
  };

  const handleSave = async () => {
    if (!accessToken) return;

    const id = (form.id || slugify(form.title) || '').trim();
    if (!id) {
      alert('Card ID is required (or provide a title to auto-generate one).');
      return;
    }
    if (!form.title.trim() || !form.description.trim() || !form.imageUrl.trim() || !form.ctaLabel.trim() || !form.ctaHref.trim()) {
      alert('Title, description, image URL, CTA label and CTA link are required.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/announcements/home-rail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          title: form.title.trim(),
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim(),
          ctaLabel: form.ctaLabel.trim(),
          ctaHref: form.ctaHref.trim(),
          displayOrder: Number(form.displayOrder || 100),
          isActive: form.isActive,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to save card');
      }

      resetForm();
      await loadItems();
      alert('Card saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save card';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (card: HomeRailCard) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/home-rail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: card.id,
          title: card.title,
          description: card.description,
          imageUrl: card.imageUrl,
          ctaLabel: card.ctaLabel,
          ctaHref: card.ctaHref,
          displayOrder: card.displayOrder,
          isActive: !card.isActive,
          startsAt: card.startsAt,
          endsAt: card.endsAt,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to update card state');
      }
      await loadItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update card state';
      alert(message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-lg text-slate-700">Loading card rail settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-5xl mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Home Card Rail Management</h1>
          <p className="mt-2 text-slate-600">Edit and publish browse cards shown on the public home page. Changes update rail version and can reopen closed rails for users.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? 'Edit Card' : 'Create / Publish Card'}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              New card
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Load previous card</label>
              <select
                value={selectedPreviousId}
                onChange={(e) => setSelectedPreviousId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select previous card...</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({item.id})
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Card ID</label>
            <input
              value={form.id}
              onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="e.g. escrow-protection"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Used as stable key for version tracking.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Plan Your Fitout"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Body text</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder="Short supporting message shown in card rail"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
              <input
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="/assets/images/feature-renovation.png"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Card preview" className="h-20 w-20 rounded-md object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-md bg-slate-200" />
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CTA label</label>
              <input
                value={form.ctaLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, ctaLabel: e.target.value }))}
                placeholder="Start a request"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CTA href</label>
              <input
                value={form.ctaHref}
                onChange={(e) => setForm((prev) => ({ ...prev, ctaHref: e.target.value }))}
                placeholder="#project-prompt"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Display order</label>
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, displayOrder: Number(e.target.value || 100) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Starts at (optional)</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ends at (optional)</label>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Active card
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : editingId ? 'Save updates' : 'Create card'}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Cards</h2>
            <p className="text-sm text-emerald-700 font-medium">Active cards: {activeCount}</p>
          </div>

          <div className="space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-slate-600">No cards yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      {item.isActive && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                      )}
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editCard(item)}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        {item.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <img src={item.imageUrl} alt={item.title} className="h-14 w-14 rounded-md object-cover bg-slate-100" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-500">CTA: {item.ctaLabel} {'->'} {item.ctaHref}</p>
                      <p className="mt-1 text-xs text-slate-500">Order: {item.displayOrder}</p>
                      <p className="mt-1 text-xs text-slate-500">Updated: {new Date(item.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
