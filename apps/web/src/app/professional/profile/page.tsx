'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import FileUploader from '@/components/file-uploader';

interface ReferenceProject {
  id: string;
  title: string;
  description?: string | null;
  imageUrls: string[];
  createdAt: string;
}

interface ProfessionalProfile {
  id: string;
  email: string;
  fullName?: string | null;
  businessName?: string | null;
  phone?: string | null;
  professionType?: string | null;
  serviceArea?: string | null;
  locationPrimary?: string | null;
  locationSecondary?: string | null;
  locationTertiary?: string | null;
  suppliesOffered?: string[];
  tradesOffered?: string[];
  primaryTrade?: string | null;
  referenceProjects?: ReferenceProject[];
  profileImages?: string[];
}

const emptyProfile: ProfessionalProfile = {
  id: '',
  email: '',
  fullName: '',
  businessName: '',
  phone: '',
  professionType: '',
  serviceArea: '',
  locationPrimary: '',
  locationSecondary: '',
  locationTertiary: '',
  suppliesOffered: [],
  tradesOffered: [],
  primaryTrade: '',
  referenceProjects: [],
  profileImages: [],
};

export default function ProfessionalProfilePage() {
  const router = useRouter();
  const { isLoggedIn, professional, accessToken } = useProfessionalAuth();
  const [profile, setProfile] = useState<ProfessionalProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refProjects, setRefProjects] = useState<ReferenceProject[]>([]);
  const [refDraft, setRefDraft] = useState<{ id?: string; title: string; description: string; imageUrls: string[] }>(
    { id: undefined, title: '', description: '', imageUrls: [] },
  );
  const [refSaving, setRefSaving] = useState(false);

  const uploadFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { urls: string[] };
    return data.urls;
  };

  const uploadProfileImages = async (files: File[]) => {
    const urls = await uploadFiles(files);
    setProfile((p) => ({ ...p, profileImages: [...(p.profileImages || []), ...urls] }));
    return urls;
  };

  const uploadRefImages = async (files: File[]) => {
    const urls = await uploadFiles(files);
    setRefDraft((d) => ({ ...d, imageUrls: [...(d.imageUrls || []), ...urls] }));
    return urls;
  };

  const removeProfileImage = (url: string) => {
    setProfile((p) => ({ ...p, profileImages: (p.profileImages || []).filter((u) => u !== url) }));
  };

  const removeRefImage = (url: string) => {
    setRefDraft((d) => ({ ...d, imageUrls: (d.imageUrls || []).filter((u) => u !== url) }));
  };


  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/professional-login');
      return;
    }
    if (!isLoggedIn || !accessToken) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/professional/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          router.push('/professional-login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setProfile({ ...emptyProfile, ...data });
        setRefProjects(data.referenceProjects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isLoggedIn, accessToken, router]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fullName: profile.fullName || undefined,
          businessName: profile.businessName || undefined,
          phone: profile.phone || undefined,
          professionType: profile.professionType || undefined,
          serviceArea: profile.serviceArea || undefined,
          locationPrimary: profile.locationPrimary || undefined,
          locationSecondary: profile.locationSecondary || undefined,
          locationTertiary: profile.locationTertiary || undefined,
          suppliesOffered: profile.suppliesOffered || [],
          tradesOffered: profile.tradesOffered || [],
          primaryTrade: profile.primaryTrade || undefined,
          profileImages: profile.profileImages || [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const resetRefDraft = () => setRefDraft({ id: undefined, title: '', description: '', imageUrls: [] });

  const handleRefSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refDraft.title.trim() || !accessToken) return;
    setRefSaving(true);
    setError(null);
    try {
      if (refDraft.id) {
        const res = await fetch(`${API_BASE_URL}/professional/reference-projects/${refDraft.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            title: refDraft.title.trim(),
            description: refDraft.description?.trim() || undefined,
            imageUrls: refDraft.imageUrls,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        setRefProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const res = await fetch(`${API_BASE_URL}/professional/reference-projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            title: refDraft.title.trim(),
            description: refDraft.description?.trim() || undefined,
            imageUrls: refDraft.imageUrls,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        setRefProjects((prev) => [created, ...prev]);
      }
      resetRefDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reference project');
    } finally {
      setRefSaving(false);
    }
  };

  const handleRefEdit = (proj: ReferenceProject) => {
    setRefDraft({
      id: proj.id,
      title: proj.title,
      description: proj.description || '',
      imageUrls: proj.imageUrls || [],
    });
  };

  const handleRefDelete = async (id: string) => {
    if (!accessToken) return;
    setRefSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/reference-projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRefProjects((prev) => prev.filter((p) => p.id !== id));
      if (refDraft.id === id) resetRefDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete reference project');
    } finally {
      setRefSaving(false);
    }
  };

  if (loading || isLoggedIn === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="mt-4 text-slate-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">Professional</p>
            <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
            <p className="text-sm text-slate-600">Manage your professional details and reference projects.</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div>{professional?.email || profile.email}</div>
            <div className="text-xs text-slate-400">ID: {professional?.id || profile.id}</div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                value={profile.fullName || ''}
                onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Business Name</label>
              <input
                type="text"
                value={profile.businessName || ''}
                onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone</label>
              <input
                type="text"
                value={profile.phone || ''}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Profession Type</label>
              <input
                type="text"
                value={profile.professionType || ''}
                onChange={(e) => setProfile((p) => ({ ...p, professionType: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Renovation, HVAC, Electrical"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Primary Trade</label>
              <input
                type="text"
                value={profile.primaryTrade || ''}
                onChange={(e) => setProfile((p) => ({ ...p, primaryTrade: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Carpentry"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Service Area</label>
              <input
                type="text"
                value={profile.serviceArea || ''}
                onChange={(e) => setProfile((p) => ({ ...p, serviceArea: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Hong Kong Island"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Location (Primary)</label>
              <input
                type="text"
                value={profile.locationPrimary || ''}
                onChange={(e) => setProfile((p) => ({ ...p, locationPrimary: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Location (Secondary)</label>
              <input
                type="text"
                value={profile.locationSecondary || ''}
                onChange={(e) => setProfile((p) => ({ ...p, locationSecondary: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Location (Tertiary)</label>
              <input
                type="text"
                value={profile.locationTertiary || ''}
                onChange={(e) => setProfile((p) => ({ ...p, locationTertiary: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Supplies Offered (comma separated)</label>
              <input
                type="text"
                value={(profile.suppliesOffered || []).join(', ')}
                onChange={(e) => setProfile((p) => ({ ...p, suppliesOffered: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Trades Offered (comma separated)</label>
              <input
                type="text"
                value={(profile.tradesOffered || []).join(', ')}
                onChange={(e) => setProfile((p) => ({ ...p, tradesOffered: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Profile images</p>
                <p className="text-xs text-slate-500">Upload photos that best represent your work (max 5, 10MB each).</p>
              </div>
              <span className="text-xs text-slate-500">Cloudflare storage</span>
            </div>

            <FileUploader
              maxFiles={5}
              maxFileSize={10 * 1024 * 1024}
              onUpload={uploadProfileImages}
              showUploadAction
            />

            {(profile.profileImages && profile.profileImages.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-3">
                {profile.profileImages.map((url) => (
                  <div key={url} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img src={url} alt="Profile" className="h-28 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeProfileImage(url)}
                      className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-rose-700 shadow"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Reference projects */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">Portfolio</p>
            <h2 className="text-xl font-bold text-slate-900">Reference projects</h2>
            <p className="text-sm text-slate-600">Add projects that showcase your work (title, description, and photos).</p>
          </div>
        </div>

        <form onSubmit={handleRefSave} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 mb-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Title *</label>
              <input
                type="text"
                value={refDraft.title}
                onChange={(e) => setRefDraft((d) => ({ ...d, title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Project photos</label>
              <FileUploader
                maxFiles={5}
                maxFileSize={10 * 1024 * 1024}
                onUpload={uploadRefImages}
                showUploadAction
              />
              {refDraft.imageUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {refDraft.imageUrls.map((url) => (
                    <div key={url} className="group relative overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                      <img src={url} alt={refDraft.title || 'Reference image'} className="h-20 w-32 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeRefImage(url)}
                        className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-rose-700 shadow opacity-0 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={refDraft.description}
              onChange={(e) => setRefDraft((d) => ({ ...d, description: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="What was delivered, scope, highlights, materials, etc."
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              {refDraft.id ? 'Editing existing reference project' : 'Add a new reference project'}
            </div>
            <div className="flex gap-2">
              {refDraft.id && (
                <button
                  type="button"
                  onClick={resetRefDraft}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
                >
                  Cancel edit
                </button>
              )}
              <button
                type="submit"
                disabled={refSaving || !refDraft.title.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {refSaving ? 'Saving...' : refDraft.id ? 'Update project' : 'Add project'}
              </button>
            </div>
          </div>
        </form>

        {refProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-600">
            No reference projects yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {refProjects.map((proj) => (
              <div key={proj.id} className="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{proj.title}</h3>
                    <p className="text-xs text-slate-500">Added {new Date(proj.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefEdit(proj)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleRefDelete(proj.id)}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {proj.description ? (
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{proj.description}</p>
                ) : null}
                {proj.imageUrls && proj.imageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {proj.imageUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group block overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={url}
                          alt={proj.title}
                          className="h-20 w-full object-cover transition group-hover:scale-105"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
