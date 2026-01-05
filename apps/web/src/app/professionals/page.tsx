
// Wrap search params usage in Suspense to satisfy Next.js requirements
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Professional } from '../../lib/types';
import ProfessionalsList from '@/components/professionals-list';
import { ProtectedPageOverlay } from '@/components/protected-page-overlay';
import { professionals as fallbackProfessionals } from '@/data/professionals';
import type { CanonicalLocation } from '@/components/location-select';
import { API_BASE_URL } from '@/config/api';
import { useSearchParams } from 'next/navigation';
import { matchLocation } from '@/lib/location-matcher';
import type { ProjectFormData } from '@/components/project-form';

function extractPhotoUrls(notes?: string): string[] {
  if (!notes) return [];
  const matches = notes.match(/(https?:\/\/[^\s,;\)]+|\/api?\/uploads\/[^\s,;\)]+)/gi) || [];
  return matches
    .filter((url) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return lower.includes("/uploads/") ||
             lower.endsWith(".jpg") ||
             lower.endsWith(".jpeg") ||
             lower.endsWith(".png") ||
             lower.endsWith(".webp") ||
             lower.endsWith(".gif");
    })
    .map((url) => url.trim());
}

function stripPhotoSection(notes?: string): string {
  if (!notes) return "";
  return notes
    .split(/\r?\n/)
    .map((line) => (line.trim().toLowerCase().startsWith("photos:") ? "" : line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toAbsolute(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  const base = API_BASE_URL.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
}

function ProfessionalsPageInner() {
  const { isLoggedIn, userLocation } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;
  const tradeParam = searchParams.get('trade') || undefined;
  const [projectRegion, setProjectRegion] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [projectPrefill, setProjectPrefill] = useState<Partial<ProjectFormData>>({});

  useEffect(() => {
    const fetchProfessionals = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/professionals`, {
          next: { revalidate: 60 }, // Cache for 60 seconds
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text().then((text) => {
              throw new Error(`Expected JSON, got: ${text.slice(0, 120)}`);
            });

        const data = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { data?: Professional[] }).data)
            ? (payload as { data: Professional[] }).data
            : [];

        console.log('API Response - first professional:', data[0]);
        setProfessionals(data.length ? data : fallbackProfessionals);
      } catch (error) {
        console.error('Failed to fetch professionals:', error);
        // Show a sensible fallback instead of crashing on invalid JSON responses
        setProfessionals(fallbackProfessionals);
      } finally {
        setLoading(false);
      }
    };

    if (isLoggedIn) {
      fetchProfessionals();
    } else if (isLoggedIn === false) {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // If arriving from a project, fetch it to pre-populate filters
  useEffect(() => {
    const loadProject = async () => {
      if (!projectId || !isLoggedIn) return;
      console.log('[ProfessionalsPage] Loading project:', projectId);
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}`);
        if (!res.ok) {
          console.warn('[ProfessionalsPage] Project fetch failed:', res.status);
          return;
        }
        const p = await res.json();
        const region = typeof p?.region === 'string' ? p.region : undefined;
        // Use all trades from tradesRequired array, fallback to projectName for old data
        let name: string | undefined;
        if (Array.isArray(p?.tradesRequired) && p.tradesRequired.length > 0) {
          // If multiple trades, use first for now (OR logic will match professionals with any of these)
          name = p.tradesRequired[0];
          // Log all required trades for future multi-trade filtering
          console.log('[ProfessionalsPage] Multiple trades required:', p.tradesRequired);
        } else if (typeof p?.projectName === 'string') {
          name = p.projectName;
        }
        const photoUrls = extractPhotoUrls(p?.notes || undefined).map(toAbsolute);
        const cleanedNotes = stripPhotoSection(p?.notes || undefined);
        const matchedLocation = region ? matchLocation(region) : null;
        console.log('[ProfessionalsPage] Project data:', { region, name, tradesRequired: p?.tradesRequired, project: p });
        setProjectRegion(region);
        setProjectName(name);
        setProjectPrefill({
          projectName: typeof p?.projectName === 'string' ? p.projectName : name,
          tradesRequired: Array.isArray(p?.tradesRequired) && p.tradesRequired.length > 0 ? p.tradesRequired : name ? [name] : [],
          location: matchedLocation ? { primary: matchedLocation.primary, secondary: matchedLocation.secondary, tertiary: matchedLocation.tertiary } : undefined,
          notes: cleanedNotes,
          photoUrls,
        });
      } catch (err) {
        console.error('[ProfessionalsPage] Project fetch error:', err);
      }
    };
    loadProject();
  }, [projectId, isLoggedIn]);

  // Prefer user default location; fallback to intentData (handled in ProfessionalsList)
  const defaultLocation: CanonicalLocation = useMemo(() => {
    if (projectRegion) {
      const ml = matchLocation(projectRegion);
      console.log('[ProfessionalsPage] matchLocation result:', { projectRegion, ml });
      if (ml) return { primary: ml.primary, secondary: ml.secondary, tertiary: ml.tertiary } as CanonicalLocation;
    }
    return userLocation;
  }, [projectRegion, userLocation]);

  console.log('[ProfessionalsPage] Final state:', { userLocation, projectRegion, projectName, defaultLocation });

  return (
    <>
      {/* Protected page overlay */}
      <ProtectedPageOverlay
        onJoinClick={openJoinModal}
        onLoginClick={openLoginModal}
      />

      <div className="space-y-8">
        {/* Compact Hero Section */}
        <section className="relative rounded-xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white py-6 px-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-400">
              Marketplace
            </p>
            <h1 className="text-2xl font-bold">
              Find Trusted Professionals
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Browse vetted contractors, companies, and resellers with verified ratings and proven expertise.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-5 w-32 bg-slate-200 rounded"></div>
                  <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-slate-200 rounded"></div>
                  <div className="h-4 w-64 bg-slate-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : professionals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No professionals yet. Submit a registration to see them listed here.
          </div>
        ) : (
          <ProfessionalsList
            professionals={professionals}
            initialLocation={defaultLocation}
            projectId={projectId}
            initialSearchTerm={tradeParam || projectName}
            initialProjectData={projectPrefill}
          />
        )}
      </div>
    </>
  );
}

export default function ProfessionalsPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading professionals...</div>}>
      <ProfessionalsPageInner />
    </Suspense>
  );
}
