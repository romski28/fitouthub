'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';
import { HkZoneMap } from '@/components/hk-zone-map';
import { HkZoneList } from '@/components/hk-zone-list';
import { MapOrList } from '@/components/map-or-list';
import { ProfessionalCertificationManager } from '@/components/professional-certification-manager';
import {
  HK_ZONE_CODES,
  areaCodesToZoneCodes,
  deriveAreaCodesFromCoveragePayload,
  deriveCoverageDraftFromAreaCodes,
  type HkZoneCode,
  zoneCodesToAreaCodes,
} from '@/lib/hk-districts';
import { tradesmen as fallbackTradesmen } from '@/data/tradesmen';

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

const PROFESSION_TYPE_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'reseller', label: 'Reseller' },
] as const;

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
  const professionType = (profile.professionType || '').trim().toLowerCase();
  const serviceAreas = (profile.serviceArea || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const tradesOrProductsListed =
    professionType === 'reseller'
      ? (profile.suppliesOffered?.length || 0) > 0
      : (profile.tradesOffered?.length || 0) > 0 || Boolean(profile.primaryTrade);

  return [
    { label: 'Business or full name added', done: Boolean(profile.businessName || profile.fullName), weight: 10 },
    { label: 'Phone number added', done: Boolean(profile.phone), weight: 10 },
    { label: 'Profession type selected', done: Boolean(profile.professionType), weight: 10 },
    { label: 'Primary trade defined', done: professionType !== 'contractor' || Boolean(profile.primaryTrade), weight: 15 },
    { label: 'Trades or products listed', done: tradesOrProductsListed, weight: 10 },
    { label: 'Service area described', done: serviceAreas.length > 0, weight: 10 },
    { label: 'Primary location added', done: Boolean(profile.locationPrimary), weight: 10 },
    { label: 'At least 3 profile images uploaded', done: (profile.profileImages?.length || 0) >= 3, weight: 10 },
    { label: 'At least 2 reference projects added', done: refProjects.length >= 2, weight: 10 },
    { label: 'Emergency availability set', done: true, weight: 5 },
  ];
};

const buildClientFacingHighlights = (
  profile: ProfessionalProfile,
  refProjects: ReferenceProject[],
  emergencyCalloutAvailable: boolean,
) => {
  const highlights: string[] = [];
  if ((profile.professionType || '').trim().toLowerCase() === 'contractor' && profile.primaryTrade) {
    highlights.push(`Primary trade: ${profile.primaryTrade}`);
  }
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
  const [allowPartnerOffers, setAllowPartnerOffers] = useState(false);
  const [allowPlatformUpdates, setAllowPlatformUpdates] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT'>('EMAIL');
  const [emergencyCalloutAvailable, setEmergencyCalloutAvailable] = useState(false);
  const [selectedCoverageAreaCodes, setSelectedCoverageAreaCodes] = useState<string[]>([]);
  const [tradeOptions, setTradeOptions] = useState<string[]>(() =>
    fallbackTradesmen.map((trade) => trade.title).filter(Boolean).sort(),
  );
  const hasLoadedRef = useRef(false);

  const profileChecklist = buildProfileChecklist(profile, refProjects, emergencyCalloutAvailable);
  const completionScore = Math.round(
    profileChecklist.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0),
  );
  const incompleteItems = profileChecklist.filter((item) => !item.done).slice(0, 4);
  const clientFacingHighlights = buildClientFacingHighlights(profile, refProjects, emergencyCalloutAvailable);
  const selectedCoverageZoneCodes = useMemo(
    () => areaCodesToZoneCodes(selectedCoverageAreaCodes),
    [selectedCoverageAreaCodes],
  );
  const normalizedProfessionType = (profile.professionType || '').trim().toLowerCase();
  const showPrimaryTrade = normalizedProfessionType === 'contractor';
  const showProductsOffered = normalizedProfessionType === 'reseller';
  const showTradesOffered = normalizedProfessionType === 'company' || normalizedProfessionType === 'contractor';
  const showEmergencyAvailability = normalizedProfessionType === 'company' || normalizedProfessionType === 'contractor';
  const selectedTradeTitles = useMemo(
    () =>
      Array.from(
        new Set(
          [profile.primaryTrade, ...(profile.tradesOffered || [])]
            .map((value) => (value || '').trim())
            .filter(Boolean),
        ),
      ),
    [profile.primaryTrade, profile.tradesOffered],
  );

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

  const handleCoverageZoneCodesChange = (zoneCodes: HkZoneCode[]) => {
    handleCoverageAreaCodesChange(zoneCodesToAreaCodes(zoneCodes));
  };

  const handleCoverageZoneToggle = (zoneCode: HkZoneCode) => {
    const next = new Set(selectedCoverageZoneCodes);
    if (next.has(zoneCode)) next.delete(zoneCode);
    else next.add(zoneCode);
    handleCoverageZoneCodesChange(HK_ZONE_CODES.filter((code) => next.has(code)));
  };

  useEffect(() => {
    let cancelled = false;

    const loadTradeOptions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/trades`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Trade request failed: ${response.status}`);
        const payload = await response.json();
        const names = (Array.isArray(payload) ? payload : [])
          .map((trade: { name?: string; title?: string; enabled?: boolean }) => trade.name ?? trade.title ?? '')
          .filter((name: string) => name.trim().length > 0)
          .sort((left: string, right: string) => left.localeCompare(right));

        if (!cancelled && names.length > 0) {
          setTradeOptions(names);
        }
      } catch {
        if (!cancelled) {
          setTradeOptions(fallbackTradesmen.map((trade) => trade.title).filter(Boolean).sort());
        }
      }
    };

    void loadTradeOptions();

    return () => {
      cancelled = true;
    };
  }, []);


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
      const res = await fetch(`${API_BASE_URL}/professional/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: profile.email || undefined,
          fullName: profile.fullName || undefined,
          businessName: profile.businessName || undefined,
          phone: profile.phone || undefined,
          professionType: profile.professionType || undefined,
          serviceArea: profile.serviceArea || undefined,
          locationPrimary: profile.locationPrimary || undefined,
          locationSecondary: profile.locationSecondary || undefined,
          locationTertiary: profile.locationTertiary || undefined,
          coverageAreaCodes: selectedCoverageAreaCodes,
          suppliesOffered: showProductsOffered ? profile.suppliesOffered || [] : [],
          tradesOffered: showTradesOffered ? profile.tradesOffered || [] : [],
          primaryTrade: showPrimaryTrade ? profile.primaryTrade || undefined : undefined,
          emergencyCalloutAvailable: showEmergencyAvailability ? emergencyCalloutAvailable : false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

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
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Change Password
          </button>
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

        <form id="professional-profile-form" onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Primary Contact</label>
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
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Profession Type</label>
              <select
                value={normalizedProfessionType}
                onChange={(e) => {
                  const nextProfessionType = e.target.value;
                  setProfile((prev) => ({
                    ...prev,
                    professionType: nextProfessionType,
                    primaryTrade: nextProfessionType === 'contractor' ? prev.primaryTrade : '',
                    suppliesOffered: nextProfessionType === 'reseller' ? prev.suppliesOffered : [],
                    tradesOffered:
                      nextProfessionType === 'company' || nextProfessionType === 'contractor'
                        ? prev.tradesOffered
                        : [],
                  }));
                  if (nextProfessionType === 'reseller') {
                    setEmergencyCalloutAvailable(false);
                  }
                }}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select profession type</option>
                {PROFESSION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Choose the listing type clients should see first.</p>
            </div>
            {showEmergencyAvailability && (
              <div className="md:self-end">
                <label className="block text-sm font-medium text-slate-700">Emergency callout available 24/7</label>
                <div className="mt-1 inline-flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEmergencyCalloutAvailable(true)}
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition ${emergencyCalloutAvailable ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400 hover:bg-slate-500'}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmergencyCalloutAvailable(false)}
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition ${!emergencyCalloutAvailable ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400 hover:bg-slate-500'}`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}
          </div>

          {(showPrimaryTrade || showProductsOffered || showTradesOffered) && (
            <div className="grid gap-4 md:grid-cols-2">
              {showPrimaryTrade && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Primary Trade</label>
                  <select
                    value={profile.primaryTrade || ''}
                    onChange={(e) => setProfile((p) => ({ ...p, primaryTrade: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select primary trade</option>
                    {tradeOptions.map((trade) => (
                      <option key={trade} value={trade}>{trade}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Lead with your most hireable specialty.</p>
                </div>
              )}
              {showProductsOffered && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Products Offered</label>
                  <input
                    type="text"
                    value={(profile.suppliesOffered || []).join(', ')}
                    onChange={(e) => setProfile((p) => ({ ...p, suppliesOffered: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">List materials, systems, or brands clients often ask about.</p>
                </div>
              )}
              {showTradesOffered && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Trades Offered</label>
                  <select
                    multiple
                    value={profile.tradesOffered || []}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        tradesOffered: Array.from(e.target.selectedOptions, (option) => option.value),
                      }))
                    }
                    className="mt-1 min-h-44 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm leading-6"
                  >
                    {tradeOptions.map((trade) => (
                      <option key={trade} value={trade}>{trade}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Use Ctrl/Cmd-click to select multiple trades.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700">Coverage</label>
            <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Zone coverage</p>
                  <p className="text-xs text-slate-500">Select service zones only. We are not using district-level coverage here for now.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCoverageZoneCodesChange(HK_ZONE_CODES)}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Whole HK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCoverageAreaCodesChange([])}
                    className="rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <MapOrList
                storageKey="fh-map-or-list-preference"
                label="Coverage input mode"
                helperText="Switch between the interactive map and a text list. Your preference is saved locally."
                mapLabel="Map"
                listLabel="Words"
                toggleGroupClassName="inline-flex w-auto gap-2"
                toggleButtonClassName="rounded-md px-4 py-2 text-sm font-semibold text-white transition"
                activeToggleButtonClassName="bg-emerald-600 hover:bg-emerald-700"
                inactiveToggleButtonClassName="bg-slate-400 hover:bg-slate-500"
                map={
                  <HkZoneMap
                    highlightedCodes={selectedCoverageZoneCodes}
                    onToggleCode={handleCoverageZoneToggle}
                    svgClassName="h-[66vh] min-h-[32rem] w-full"
                  />
                }
                list={
                  <HkZoneList
                    selectedZoneCodes={selectedCoverageZoneCodes}
                    onChange={handleCoverageZoneCodesChange}
                  />
                }
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  id="professionalAllowPartnerOffers"
                  checked={allowPartnerOffers}
                  onChange={(e) => setAllowPartnerOffers(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>I agree to receive partner offers and promotions</span>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  id="professionalAllowPlatformUpdates"
                  checked={allowPlatformUpdates}
                  onChange={(e) => setAllowPlatformUpdates(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>I agree to receive platform updates and service notifications</span>
              </label>

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
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Portfolio</h2>
                <p className="text-sm text-slate-600">
                  Manage your proof of work separately from your business profile.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {refProjects.length} reference project{refProjects.length === 1 ? '' : 's'} and {(profile.profileImages?.length || 0)} profile image{(profile.profileImages?.length || 0) === 1 ? '' : 's'}
                </p>
              </div>
              <Link
                href="/professional/portfolio"
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Manage portfolio
              </Link>
            </div>
          </div>

        </form>

        <div className="mt-4">
          <ProfessionalCertificationManager
            accessToken={accessToken!}
            selectedTradeTitles={selectedTradeTitles}
          />
        </div>

        <div className="pointer-events-none sticky bottom-4 z-20 flex justify-end">
          <button
            type="submit"
            form="professional-profile-form"
            disabled={saving}
            className="pointer-events-auto rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
