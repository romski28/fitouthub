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
  certifications?: Array<{ id: string }>;
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

// ─── Availability Grid ────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

const WorkingHoursPreset: Array<{ dayOfWeek: number; startTime: string; endTime: string; maxProjects: number; availableForEmergency: boolean }> = [
  { dayOfWeek: 1, startTime: '08:00', endTime: '18:00', maxProjects: 1, availableForEmergency: false },
  { dayOfWeek: 2, startTime: '08:00', endTime: '18:00', maxProjects: 1, availableForEmergency: false },
  { dayOfWeek: 3, startTime: '08:00', endTime: '18:00', maxProjects: 1, availableForEmergency: false },
  { dayOfWeek: 4, startTime: '08:00', endTime: '18:00', maxProjects: 1, availableForEmergency: false },
  { dayOfWeek: 5, startTime: '08:00', endTime: '18:00', maxProjects: 1, availableForEmergency: false },
];

type AvailabilityWindow = {
  id?: string;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  maxProjects?: number;
  availableForEmergency?: boolean;
};

function AvailabilityGrid({ windows, onChange }: { windows: AvailabilityWindow[]; onChange: (w: AvailabilityWindow[]) => void }) {
  const [dragStart, setDragStart] = useState<{ day: number; hour: number } | null>(null);
  const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null);

  const grid = useMemo(() => {
    const cells: boolean[][] = Array.from({ length: 7 }, () => Array(17).fill(false));
    for (const w of windows) {
      if (w.dayOfWeek == null || w.dayOfWeek < 0 || w.dayOfWeek > 6) continue;
      const startH = w.startTime ? parseInt(w.startTime.split(':')[0], 10) : 6;
      const endH = w.endTime ? parseInt(w.endTime.split(':')[0], 10) : 22;
      for (let h = startH; h < endH; h++) {
        const col = h - 6;
        if (col >= 0 && col < 17) cells[w.dayOfWeek][col] = true;
      }
    }
    return cells;
  }, [windows]);

  const handleMouseDown = (day: number, hour: number) => {
    const col = hour - 6;
    const cellOn = grid[day][col];
    const hourStr = String(hour).padStart(2, '0');
    const nhStr = String(hour + 1).padStart(2, '0');

    setDragStart({ day, hour });
    setDragMode(cellOn ? 'remove' : 'add');

    if (cellOn) {
      onChange(windows.filter((w) => !(w.dayOfWeek === day && w.startTime === `${hourStr}:00`)));
    } else {
      onChange([...windows, { dayOfWeek: day, startTime: `${hourStr}:00`, endTime: `${nhStr}:00`, maxProjects: 1, availableForEmergency: false }]);
    }
  };

  const handleMouseEnter = (day: number, hour: number) => {
    if (!dragStart || !dragMode) return;
    if (day !== dragStart.day) return;
    const minH = Math.min(dragStart.hour, hour);
    const maxH = Math.max(dragStart.hour, hour);
    const newWindows = windows.filter((w) => {
      if (w.dayOfWeek !== day) return true;
      const startH = w.startTime ? parseInt(w.startTime.split(':')[0], 10) : 0;
      return startH < minH || startH >= maxH + 1;
    });
    if (dragMode === 'add') {
      for (let h = minH; h <= maxH; h++) {
        const hStr = String(h).padStart(2, '0');
        const nhStr = String(h + 1).padStart(2, '0');
        newWindows.push({ dayOfWeek: day, startTime: `${hStr}:00`, endTime: `${nhStr}:00`, maxProjects: 1, availableForEmergency: false });
      }
    }
    onChange(newWindows);
  };

  const handleMouseUp = () => { setDragStart(null); setDragMode(null); };

  return (
    <div className="mt-2 overflow-x-auto" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="flex w-full flex-col gap-px rounded-lg border border-[rgba(120,53,15,0.12)] bg-slate-200 p-px">
        <div className="flex gap-px">
          <div className="w-10 shrink-0" />
          {HOURS.map((h) => (
            <div key={h} className="flex-1 text-center text-[9px] font-medium text-slate-500 leading-5">
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>
        {DAY_LABELS.map((label, day) => (
          <div key={day} className="flex gap-px">
            <div className="w-10 shrink-0 text-[10px] font-semibold text-slate-600 leading-5">{label}</div>
            {HOURS.map((hour) => {
              const col = hour - 6;
              const active = grid[day][col];
              return (
                <div
                  key={hour}
                  onMouseDown={(e) => { e.preventDefault(); handleMouseDown(day, hour); }}
                  onMouseEnter={() => handleMouseEnter(day, hour)}
                  className={`h-5 flex-1 cursor-pointer rounded-sm transition-colors ${active ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-white hover:bg-slate-100'}`}
                  title={`${label} ${String(hour).padStart(2, '0')}:00`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
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

const buildProfileChecklist = (
  profile: ProfessionalProfile,
  refProjects: ReferenceProject[],
  emergencyCalloutAvailable: boolean,
  hasAvailability: boolean,
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
    { label: 'Availability windows set', done: hasAvailability, weight: 5 },
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
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);
  const [selectedCoverageAreaCodes, setSelectedCoverageAreaCodes] = useState<string[]>([]);
  const [tradeOptions, setTradeOptions] = useState<string[]>(() =>
    fallbackTradesmen.map((trade) => trade.title).filter(Boolean).sort(),
  );
  const hasLoadedRef = useRef(false);
  const hydratedProfessionalIdRef = useRef<string | null>(null);

  const profileChecklist = buildProfileChecklist(profile, refProjects, emergencyCalloutAvailable, availabilityWindows.length > 0);
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
  const paperInputClassName =
    'mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm';
  const paperSelectClassName =
    'mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm';
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

    const activeProfessionalId = professional?.id || null;

    const fetchProfile = async () => {
      try {
        const shouldHydrate =
          !hasLoadedRef.current || hydratedProfessionalIdRef.current !== activeProfessionalId;

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
        if (shouldHydrate) {
          setProfile({ ...emptyProfile, ...data });
          setSelectedCoverageAreaCodes(deriveAreaCodesFromCoveragePayload(data));
          setRefProjects(data.referenceProjects || []);
          setAllowPartnerOffers(data.notificationPreferences?.allowPartnerOffers ?? false);
          setAllowPlatformUpdates(data.notificationPreferences?.allowPlatformUpdates ?? true);
          setPreferredLanguage(data.notificationPreferences?.preferredLanguage ?? 'en');
          setPreferredContactMethod(data.notificationPreferences?.primaryChannel ?? 'EMAIL');
          setEmergencyCalloutAvailable(data.emergencyCalloutAvailable ?? false);
          hydratedProfessionalIdRef.current = activeProfessionalId || data.id || null;
        }
        setError(null);
        hasLoadedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [isLoggedIn, accessToken, professional?.id, router]);

  useEffect(() => {
    if (!accessToken || !professional?.id) return;
    let cancelled = false;
    const fetchAvailability = async () => {
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/professionals/${professional.id}/availability`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('Failed to load availability');
        const data: Array<Record<string, unknown>> = await res.json();
        if (!cancelled) {
          setAvailabilityWindows(
            (Array.isArray(data) ? data : []).map((w) => ({
              id: typeof w.id === 'string' ? w.id : undefined,
              dayOfWeek: typeof w.dayOfWeek === 'number' ? w.dayOfWeek : null,
              startTime: typeof w.startTime === 'string' ? w.startTime : null,
              endTime: typeof w.endTime === 'string' ? w.endTime : null,
              maxProjects: typeof w.maxProjects === 'number' ? w.maxProjects : 1,
              availableForEmergency: w.availableForEmergency === true,
            })),
          );
        }
      } catch {
        if (!cancelled) setAvailabilityWindows([]);
      }
    };
    void fetchAvailability();
    return () => { cancelled = true; };
  }, [accessToken, professional?.id]);

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

      // Save availability windows
      if (availabilityWindows.length > 0 && professional?.id) {
        const availRes = await fetch(`${API_BASE_URL}/professionals/${professional.id}/availability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(availabilityWindows),
        });
        if (!availRes.ok) throw new Error(await availRes.text());
      }
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
      <div className="overflow-hidden rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] px-6 py-7 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(185,78,45,0.92)]">Professional Workspace</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">My Profile</h1>
            <p className="mt-2 text-sm text-slate-700">Manage your professional details, coverage, and trust signals in one place.</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-[rgba(120,53,15,0.18)] bg-[rgba(255,250,240,0.78)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(255,250,240,0.92)]"
          >
            Change Password
          </button>
        </div>
      </div>

      <div className="rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] p-6 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-[rgba(255,242,242,0.9)] px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-6 rounded-[28px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.74)] p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[rgba(185,78,45,0.92)]">Client-facing strength</p>
                <h2 className="text-lg font-bold text-slate-900">Make your profile easier to shortlist</h2>
                <p className="text-sm text-slate-700">
                  Clients are more likely to engage when they can quickly see your trade focus, coverage, proof of work, and response readiness.
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">Profile completeness</span>
                  <span className="font-bold text-[rgba(185,78,45,0.92)]">{completionScore}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[rgba(204,179,152,0.34)]">
                  <div
                    className="h-full rounded-full bg-[rgba(185,78,45,0.92)] transition-all"
                    style={{ width: `${Math.max(8, completionScore)}%` }}
                  />
                </div>
              </div>

              {clientFacingHighlights.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {clientFacingHighlights.map((item) => (
                    <span key={item} className="rounded-full bg-[rgba(255,250,240,0.88)] px-3 py-1 text-xs font-semibold text-[rgba(185,78,45,0.92)] shadow-sm ring-1 ring-[rgba(120,53,15,0.12)]">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full rounded-lg border border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.82)] p-4 shadow-sm backdrop-blur-sm lg:max-w-sm">
              <p className="text-sm font-semibold text-slate-900">Next improvements</p>
              {incompleteItems.length === 0 ? (
                <p className="mt-2 text-sm text-[rgba(185,78,45,0.92)]">Strong profile. You’ve covered the core trust signals clients look for.</p>
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
              <label className="block text-sm font-semibold text-slate-800">Primary Contact</label>
              <input
                type="text"
                value={profile.fullName || ''}
                onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                className={paperInputClassName}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Business Name</label>
              <input
                type="text"
                value={profile.businessName || ''}
                onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))}
                className={paperInputClassName}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Phone</label>
              <input
                type="text"
                value={profile.phone || ''}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                className={paperInputClassName}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Email</label>
              <input
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                className={paperInputClassName}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Profession Type</label>
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
                className={paperSelectClassName}
              >
                <option value="">Select profession type</option>
                {PROFESSION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-600">Choose the listing type clients should see first.</p>
            </div>
            {showEmergencyAvailability && (
              <div className="md:self-end">
                <label className="block text-sm font-semibold text-slate-800">Emergency callout available 24/7</label>
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

          {/* Availability grid */}
          <div className="pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Weekly Availability</h3>
                <p className="text-xs text-slate-600">Click cells to toggle. Drag to select ranges.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAvailabilityWindows(WorkingHoursPreset.map((w) => ({ ...w })))}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Working Hours
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityWindows([])}
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                >
                  Clear All
                </button>
              </div>
            </div>
            <AvailabilityGrid windows={availabilityWindows} onChange={setAvailabilityWindows} />
          </div>

          {(showPrimaryTrade || showProductsOffered || showTradesOffered) && (
            <div className="grid gap-4 md:grid-cols-2">
              {showPrimaryTrade && (
                <div>
                  <label className="block text-sm font-semibold text-slate-800">Primary Trade</label>
                  <select
                    value={profile.primaryTrade || ''}
                    onChange={(e) => setProfile((p) => ({ ...p, primaryTrade: e.target.value }))}
                    className={paperSelectClassName}
                  >
                    <option value="">Select primary trade</option>
                    {tradeOptions.map((trade) => (
                      <option key={trade} value={trade}>{trade}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-600">Lead with your most hireable specialty.</p>
                </div>
              )}
              {showProductsOffered && (
                <div>
                  <label className="block text-sm font-semibold text-slate-800">Products Offered</label>
                  <input
                    type="text"
                    value={(profile.suppliesOffered || []).join(', ')}
                    onChange={(e) => setProfile((p) => ({ ...p, suppliesOffered: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
                    className={paperInputClassName}
                  />
                  <p className="mt-1 text-xs text-slate-600">List materials, systems, or brands clients often ask about.</p>
                </div>
              )}
              {showTradesOffered && (
                <div>
                  <label className="block text-sm font-semibold text-slate-800">Trades Offered</label>
                  <select
                    multiple
                    value={profile.tradesOffered || []}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        tradesOffered: Array.from(e.target.selectedOptions, (option) => option.value),
                      }))
                    }
                    className="mt-1 min-h-44 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-4 py-3 text-sm leading-6 text-slate-900 backdrop-blur-sm"
                  >
                    {tradeOptions.map((trade) => (
                      <option key={trade} value={trade}>{trade}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-600">Use Ctrl/Cmd-click to select multiple trades.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-800">Coverage</label>
            <div className="mt-1 rounded-[28px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.72)] p-4 space-y-4 shadow-sm backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Zone coverage</p>
                  <p className="text-xs text-slate-600">Select service zones only. We are not using district-level coverage here for now.</p>
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
                headerInline
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
                    svgClassName="mx-auto h-auto w-full max-w-[32rem] sm:max-w-none sm:h-[66vh] sm:min-h-[32rem]"
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
              <label className="flex items-center gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.78)] px-4 py-3 text-sm text-slate-700 backdrop-blur-sm">
                <input
                  type="checkbox"
                  id="professionalAllowPartnerOffers"
                  checked={allowPartnerOffers}
                  onChange={(e) => setAllowPartnerOffers(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>I agree to receive partner offers and promotions</span>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.78)] px-4 py-3 text-sm text-slate-700 backdrop-blur-sm">
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
                <label htmlFor="professionalPreferredLanguage" className="block text-sm font-semibold text-slate-800">
                  Preferred language
                </label>
                <select
                  id="professionalPreferredLanguage"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
                >
                  <option value="en">English</option>
                  <option value="zh-HK">Cantonese (Traditional Chinese)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="professionalPreferredContactMethod" className="block text-sm font-semibold text-slate-800">
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
                  className="w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
                >
                  <option value="EMAIL">Email</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="WECHAT">WeChat</option>
                </select>
              </div>
            </div>
          </div>

          <div className="sticky bottom-4 z-20 pt-4">
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </div>

        </form>

        <div className="my-6 border-t border-[rgba(120,53,15,0.12)]" />

        <div className="space-y-6">
          <div className="rounded-[24px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.76)] px-4 py-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Portfolio</h2>
                <p className="text-sm text-slate-700">
                  Manage your proof of work separately from your business profile.
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {refProjects.length} reference project{refProjects.length === 1 ? '' : 's'} and {(profile.profileImages?.length || 0)} profile image{(profile.profileImages?.length || 0) === 1 ? '' : 's'}
                </p>
              </div>
              <Link
                href="/professional/portfolio"
                className="inline-flex items-center justify-center rounded-md border border-[rgba(120,53,15,0.18)] bg-[rgba(255,250,240,0.88)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(255,250,240,0.96)]"
              >
                Manage portfolio
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.76)] px-4 py-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Certifications</h2>
                <p className="text-sm text-slate-700">
                  Manage your regulated trade credentials separately from your general business profile.
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {(profile.certifications?.length || 0)} certification{(profile.certifications?.length || 0) === 1 ? '' : 's'} registered
                </p>
              </div>
              <Link
                href="/professional/certifications"
                className="inline-flex items-center justify-center rounded-md border border-[rgba(120,53,15,0.18)] bg-[rgba(255,250,240,0.88)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(255,250,240,0.96)]"
              >
                Manage certifications
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(127,29,29,0.16)] bg-[rgba(255,241,242,0.76)] px-4 py-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-slate-900">Delete my account</h2>
                <p className="mt-1 text-sm text-slate-700">
                  We would be sorry to see you go, but if you feel that is what you want to do, you know where to click.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800"
              >
                Delete account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
