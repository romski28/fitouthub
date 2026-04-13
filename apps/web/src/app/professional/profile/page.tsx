'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';
import { getUploadResponseKeys, resolveMediaAssetUrl } from '@/lib/media-assets';
import { HkDistrictMap } from '@/components/hk-district-map';
import { HkDistrictList } from '@/components/hk-district-list';
import { MapOrList } from '@/components/map-or-list';
import {
  HK_DISTRICTS,
  areaCodesToNames,
  deriveAreaCodesFromCoveragePayload,
  deriveCoverageDraftFromAreaCodes,
} from '@/lib/hk-districts';

import FileUploader from '@/components/file-uploader';
import { PortfolioCarousel } from '@/components/portfolio-carousel';
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
  notificationPreferences?: {
    primaryChannel?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    preferredLanguage?: string;
  } | null;
  emergencyCalloutAvailable?: boolean;
  regionCoverage?: Array<{
    area?: {
      code?: string | null;
      name?: string | null;
    } | null;
  }>;
}

type ProfileChecklistItem = {
  label: string;
  done: boolean;
  weight: number;
};

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

const buildProfileChecklist = (
  profile: ProfessionalProfile,
  refProjects: ReferenceProject[],
  emergencyCalloutAvailable: boolean,
): ProfileChecklistItem[] => {
  const serviceAreas = (profile.serviceArea || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [
    { label: 'Business or full name added', done: Boolean(profile.businessName || profile.fullName), weight: 10 },
    { label: 'Phone number added', done: Boolean(profile.phone), weight: 10 },
    { label: 'Profession type selected', done: Boolean(profile.professionType), weight: 10 },
    { label: 'Primary trade defined', done: Boolean(profile.primaryTrade), weight: 15 },
    { label: 'Trades or supplies listed', done: Boolean((profile.tradesOffered?.length || 0) + (profile.suppliesOffered?.length || 0)), weight: 10 },
    { label: 'Service area described', done: serviceAreas.length > 0, weight: 10 },
    { label: 'Primary location added', done: Boolean(profile.locationPrimary), weight: 10 },
    { label: 'At least 3 profile images uploaded', done: (profile.profileImages?.length || 0) >= 3, weight: 10 },
    { label: 'At least 2 reference projects added', done: refProjects.length >= 2, weight: 10 },
    { label: 'Emergency availability set', done: emergencyCalloutAvailable || profile.professionType === 'reseller', weight: 5 },
  ];
};

const buildClientFacingHighlights = (
  profile: ProfessionalProfile,
  refProjects: ReferenceProject[],
  emergencyCalloutAvailable: boolean,
) => {
  const highlights: string[] = [];
  if (profile.primaryTrade) highlights.push(`Primary trade: ${profile.primaryTrade}`);
  if (profile.serviceArea) highlights.push(`Covers ${profile.serviceArea}`);
  if (refProjects.length > 0) highlights.push(`${refProjects.length} reference project${refProjects.length === 1 ? '' : 's'} added`);
  if ((profile.profileImages?.length || 0) > 0) highlights.push(`${profile.profileImages?.length} portfolio photo${profile.profileImages?.length === 1 ? '' : 's'} uploaded`);
  if (emergencyCalloutAvailable) highlights.push('24/7 emergency callout available');
  return highlights.slice(0, 4);
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
  const [refError, setRefError] = useState<string | null>(null);
  const [refPendingFiles, setRefPendingFiles] = useState<File[]>([]);
  const [pendingProfileFiles, setPendingProfileFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [allowPartnerOffers, setAllowPartnerOffers] = useState(false);
  const [allowPlatformUpdates, setAllowPlatformUpdates] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT'>('EMAIL');
  const [emergencyCalloutAvailable, setEmergencyCalloutAvailable] = useState(false);
  const [selectedCoverageAreaCodes, setSelectedCoverageAreaCodes] = useState<string[]>([]);
  const hasLoadedRef = useRef(false);

  const profileChecklist = buildProfileChecklist(profile, refProjects, emergencyCalloutAvailable);
  const completionScore = Math.round(
    profileChecklist.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0),
  );
  const incompleteItems = profileChecklist.filter((item) => !item.done).slice(0, 4);
  const clientFacingHighlights = buildClientFacingHighlights(profile, refProjects, emergencyCalloutAvailable);
  const selectedCoverageNames = useMemo(() => areaCodesToNames(selectedCoverageAreaCodes), [selectedCoverageAreaCodes]);

  const handleCoverageAreaCodesChange = (codes: string[]) => {
    const nextDraft = deriveCoverageDraftFromAreaCodes(codes);
    setSelectedCoverageAreaCodes(codes);
    setProfile((prev) => ({
      ...prev,
      serviceArea: nextDraft.serviceArea,
      locationPrimary: nextDraft.locationPrimary,
      locationSecondary: nextDraft.locationSecondary,
      locationTertiary: nextDraft.locationTertiary,
    }));
  };

  const uploadFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return getUploadResponseKeys(data);
  };

  const uploadProfileImages = async (files: File[]) => {
    const keys = await uploadFiles(files);
    setProfile((p) => ({ ...p, profileImages: [...(p.profileImages || []), ...keys] }));
    setPendingProfileFiles([]);
    return keys;
  };

  const uploadRefImages = async (files: File[]) => {
    const urls = await uploadFiles(files);
    setRefDraft((d) => ({ ...d, imageUrls: [...(d.imageUrls || []), ...urls] }));
    setRefPendingFiles([]);
    return urls;
  };

  const removeProfileImage = (url: string) => {
    setProfile((p) => ({ ...p, profileImages: (p.profileImages || []).filter((u) => u !== url) }));
  };

  const removeRefImage = (url: string) => {
    setRefDraft((d) => ({ ...d, imageUrls: (d.imageUrls || []).filter((u) => u !== url) }));
    // Clear pending files when removing images to allow re-adding
    setRefPendingFiles([]);
  };


  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
      return;
    }
    if (!isLoggedIn || !accessToken) return;

    const fetchProfile = async () => {
      try {
        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        const res = await fetchWithRetry(`${API_BASE_URL}/professional/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setProfile({ ...emptyProfile, ...data });
        setSelectedCoverageAreaCodes(deriveAreaCodesFromCoveragePayload(data));
        setRefProjects(data.referenceProjects || []);
        setAllowPartnerOffers(data.notificationPreferences?.allowPartnerOffers ?? false);
        setAllowPlatformUpdates(data.notificationPreferences?.allowPlatformUpdates ?? true);
        setPreferredLanguage(data.notificationPreferences?.preferredLanguage ?? 'en');
        setPreferredContactMethod(data.notificationPreferences?.primaryChannel ?? 'EMAIL');
        setEmergencyCalloutAvailable(data.emergencyCalloutAvailable ?? false);
        hasLoadedRef.current = true;
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
      // Upload any files the user staged but didn't explicitly click Upload for
      let finalProfileImages = [...(profile.profileImages || [])];
      if (pendingProfileFiles.length > 0) {
        const uploadedKeys = await uploadFiles(pendingProfileFiles);
        finalProfileImages = [...finalProfileImages, ...uploadedKeys];
        setProfile((p) => ({ ...p, profileImages: finalProfileImages }));
        setPendingProfileFiles([]);
      }

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
          coverageAreaCodes: selectedCoverageAreaCodes,
          suppliesOffered: profile.suppliesOffered || [],
          tradesOffered: profile.tradesOffered || [],
          primaryTrade: profile.primaryTrade || undefined,
          profileImages: finalProfileImages,
          emergencyCalloutAvailable: emergencyCalloutAvailable,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Optional password update if provided
      if (password && password.length >= 6) {
        const pwRes = await fetch(`${API_BASE_URL}/professional/me/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ password }),
        });
        if (!pwRes.ok) throw new Error(await pwRes.text());
        setPassword('');
      }

      const prefRes = await fetch(`${API_BASE_URL}/professional/me/notification-preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          allowPartnerOffers,
          allowPlatformUpdates,
          preferredLanguage,
          preferredContactMethod,
        }),
      });
      if (!prefRes.ok) throw new Error(await prefRes.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const resetRefDraft = () => setRefDraft({ id: undefined, title: '', description: '', imageUrls: [] });

  const handleRefSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    if (!refDraft.title.trim()) {
      setRefError('Title is required');
      return;
    }
    setRefSaving(true);
    setRefError(null);
    try {
      // Upload any pending files and get URLs
      let finalImageUrls = [...(refDraft.imageUrls || [])];
      if (refPendingFiles.length > 0) {
        const uploadedUrls = await uploadFiles(refPendingFiles);
        finalImageUrls = [...finalImageUrls, ...uploadedUrls];
        setRefPendingFiles([]);
      }
      
      // Then save the project with the final image URLs
      if (refDraft.id) {
        const res = await fetch(`${API_BASE_URL}/professional/reference-projects/${refDraft.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            title: refDraft.title.trim(),
            description: refDraft.description?.trim() || undefined,
            imageUrls: finalImageUrls,
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
            imageUrls: finalImageUrls,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        setRefProjects((prev) => [created, ...prev]);
      }
      resetRefDraft();
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Failed to save reference project');
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
    setRefPendingFiles([]);
    setRefError(null);
  };

  const handleRefDelete = async (id: string) => {
    if (!accessToken) return;
    setRefSaving(true);
    setRefError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/reference-projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRefProjects((prev) => prev.filter((p) => p.id !== id));
      if (refDraft.id === id) resetRefDraft();
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Failed to delete reference project');
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
    <div className="max-w-5xl mx-auto py-8 px-3 sm:px-6 lg:px-8 space-y-6">
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

        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Client-facing strength</p>
                <h2 className="text-lg font-bold text-slate-900">Make your profile easier to shortlist</h2>
                <p className="text-sm text-slate-600">
                  Clients are more likely to engage when they can quickly see your trade focus, coverage, proof of work, and response readiness.
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">Profile completeness</span>
                  <span className="font-bold text-emerald-700">{completionScore}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.max(8, completionScore)}%` }}
                  />
                </div>
              </div>

              {clientFacingHighlights.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {clientFacingHighlights.map((item) => (
                    <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full rounded-lg border border-white/80 bg-white p-4 shadow-sm lg:max-w-sm">
              <p className="text-sm font-semibold text-slate-900">Next improvements</p>
              {incompleteItems.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-700">Strong profile. You’ve covered the core trust signals clients look for.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {incompleteItems.map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <span className="mt-0.5 text-amber-500">•</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

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
              <p className="mt-1 text-xs text-slate-500">Use the trade wording clients would search for first.</p>
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
              <p className="mt-1 text-xs text-slate-500">Lead with your most hireable specialty.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Coverage</label>
              <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Interactive coverage editor</p>
                    <p className="text-xs text-slate-500">Pick every district you cover. The text summary below stays in sync for legacy compatibility.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCoverageAreaCodesChange(HK_DISTRICTS.map((district) => district.areaCode))}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Whole HK
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCoverageAreaCodesChange([])}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <MapOrList
                  storageKey="fh-map-or-list-preference"
                  label="Coverage input mode"
                  helperText="Switch between the interactive map and a text list. Your preference is saved locally."
                  mapLabel="Graphic"
                  listLabel="Text list"
                  map={
                    <HkDistrictMap
                      selectedAreaCodes={selectedCoverageAreaCodes}
                      onChange={handleCoverageAreaCodesChange}
                    />
                  }
                  list={
                    <HkDistrictList
                      selectedAreaCodes={selectedCoverageAreaCodes}
                      onChange={handleCoverageAreaCodesChange}
                    />
                  }
                />

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service Area</p>
                    <p className="mt-1 text-sm text-slate-700">{profile.serviceArea || 'No districts selected yet'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Primary Region</p>
                    <p className="mt-1 text-sm text-slate-700">{profile.locationPrimary || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">District Count</p>
                    <p className="mt-1 text-sm text-slate-700">{selectedCoverageAreaCodes.length || 0}</p>
                  </div>
                </div>

                {selectedCoverageNames.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedCoverageNames.map((name) => (
                      <span key={name} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
              <p className="mt-1 text-xs text-slate-500">List materials, systems, or brands clients often ask about.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Trades Offered (comma separated)</label>
              <input
                type="text"
                value={(profile.tradesOffered || []).join(', ')}
                onChange={(e) => setProfile((p) => ({ ...p, tradesOffered: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Add adjacent services to widen matching without diluting your main trade.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Minimum 6 characters"
            />
            <p className="mt-1 text-xs text-slate-500">Leave blank to keep your current password</p>
          </div>

          {(profile.professionType === 'contractor' || profile.professionType === 'company') && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Availability</h2>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="professionalEmergencyCallout"
                  checked={emergencyCalloutAvailable}
                  onChange={(e) => setEmergencyCalloutAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="professionalEmergencyCallout" className="text-sm text-slate-700">
                  Emergency call out available 24/7
                </label>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-200 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="professionalAllowPartnerOffers"
                checked={allowPartnerOffers}
                onChange={(e) => setAllowPartnerOffers(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="professionalAllowPartnerOffers" className="text-sm text-slate-700">
                I agree to receive partner offers and promotions
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="professionalAllowPlatformUpdates"
                checked={allowPlatformUpdates}
                onChange={(e) => setAllowPlatformUpdates(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="professionalAllowPlatformUpdates" className="text-sm text-slate-700">
                I agree to receive platform updates and service notifications
              </label>
            </div>

            <div className="space-y-2">
              <label htmlFor="professionalPreferredLanguage" className="block text-sm text-slate-700">
                Preferred language
              </label>
              <select
                id="professionalPreferredLanguage"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="zh-HK">Cantonese (Traditional Chinese)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="professionalPreferredContactMethod" className="block text-sm text-slate-700">
                Preferred contact method
              </label>
              <select
                id="professionalPreferredContactMethod"
                value={preferredContactMethod}
                onChange={(e) =>
                  setPreferredContactMethod(
                    e.target.value as 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT',
                  )
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
                <option value="WECHAT">WeChat</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Profile images</p>
                <p className="text-xs text-slate-500">Upload your strongest before/after or finished-work photos first. Clients usually decide fast.</p>
              </div>
              <span className="text-xs text-slate-500">Cloudflare storage</span>
            </div>

            <FileUploader
              maxFiles={5}
              maxFileSize={10 * 1024 * 1024}
              onUpload={uploadProfileImages}
              onFilesChange={(files) => setPendingProfileFiles(files)}
              showUploadAction
            />

            {(profile.profileImages && profile.profileImages.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-3">
                {profile.profileImages.map((url) => (
                  <div key={url} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img src={resolveMediaAssetUrl(url)} alt="Profile" className="h-28 w-full object-cover" />
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

        {refError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {refError}
          </div>
        )}

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
                onFilesChange={(files) => setRefPendingFiles(files)}
                showUploadAction
              />
              {refDraft.imageUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {refDraft.imageUrls.map((url) => (
                    <div key={url} className="group relative overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                      <img src={resolveMediaAssetUrl(url)} alt={refDraft.title || 'Reference image'} className="h-20 w-32 object-cover" />
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
              placeholder="What was delivered, client challenge, scope, standout finish, timeline, and materials used."
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
                  onClick={() => {
                    resetRefDraft();
                    setRefPendingFiles([]);
                  }}
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
          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            No project entered, please add more for better client experience.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
            {refProjects.map((proj) => (
              <div key={proj.id} className="flex-shrink-0 w-full sm:w-96 rounded-lg border border-slate-200 p-4 bg-white shadow-sm">
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
                <div className="mt-3">
                  <PortfolioCarousel 
                    images={proj.imageUrls || []}
                    emptyMessage="No photos added to this project yet"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
