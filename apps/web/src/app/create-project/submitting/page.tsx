'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';
import {
  clearCreateProjectDraftHandoff,
  clearProjectDescriptionHandoff,
  getCreateProjectDraftHandoff,
} from '@/lib/create-project-handoff';
import { getUploadResponseKeys } from '@/lib/media-assets';
import { clearAiClientState } from '@/lib/client-session';
import { MimoSpinner } from '@/components/mimo-spinner';

// Module-level safety data — survives all React re-renders
let _safetyNotes: string[] = [];
let _riskNotes: string[] = [];
let _riskLevel: string | null = null;

export default function SubmittingPage() {
  const router = useRouter();
  const { isLoggedIn, accessToken, user } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(true);

  // Safety review state
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [safetyExpanded, setSafetyExpanded] = useState(false);
  const [completedProjectId, setCompletedProjectId] = useState<string | null>(null);
  const [completedSurveyStep, setCompletedSurveyStep] = useState(false);
  const [safetyNotes, setSafetyNotes] = useState<string[]>([]);
  const [riskNotes, setRiskNotes] = useState<string[]>([]);
  const [riskLevel, setRiskLevel] = useState<string | null>(null);
  const autoRedirectTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (hydrated && isLoggedIn === false) router.push('/');
  }, [hydrated, isLoggedIn, router]);

  // Auto-redirect 10s after submission completes, unless user expanded safety
  useEffect(() => {
    if (submissionComplete && completedProjectId && !safetyExpanded) {
      const timer = setTimeout(() => {
        console.log('[submitting][redirect] auto-redirect after 10s dwell');
        router.push(
          completedSurveyStep
            ? `/projects/${completedProjectId}?launchNextStep=BOOK_MIMO_SURVEY`
            : `/projects/${completedProjectId}`,
        );
      }, 10000);
      autoRedirectTimerRef.current = timer;
      return () => { clearTimeout(timer); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionComplete, completedProjectId, safetyExpanded, completedSurveyStep, router]);

  const handleSafetyDismiss = () => {
    if (!completedProjectId || !submissionComplete) return;
    if (autoRedirectTimerRef.current) clearTimeout(autoRedirectTimerRef.current);
    router.push(
      completedSurveyStep
        ? `/projects/${completedProjectId}?launchNextStep=BOOK_MIMO_SURVEY`
        : `/projects/${completedProjectId}`,
    );
  };

  // Kick off submission on mount
  useEffect(() => {
    if (!hydrated || !isLoggedIn || !user) return;

    const draft = getCreateProjectDraftHandoff();
    const storedDraftStr = typeof window !== 'undefined' ? sessionStorage.getItem('createProjectDraft') : null;
    let storedDraft: any = null;
    if (storedDraftStr) {
      try { storedDraft = JSON.parse(storedDraftStr); } catch { /* ignore */ }
    }

    const mergedInitial = {
      ...(storedDraft?.initialData || {}),
      ...(draft?.initialData || {}),
    };
    const mergedSafety = draft?.safetyNotes || storedDraft?.safetyNotes;
    const mergedRisks = draft?.riskNotes || storedDraft?.riskNotes;
    const mergedRiskLevel = draft?.riskLevel || storedDraft?.riskLevel;

    console.log('[submitting][safety] draft:', {
      handoffSafety: draft?.safetyNotes,
      storedSafety: storedDraft?.safetyNotes,
      mergedSafety,
      mergedRisks,
      mergedRiskLevel,
    });

    if (mergedSafety?.length) { setSafetyNotes(mergedSafety); _safetyNotes = mergedSafety; }
    if (mergedRisks?.length) { setRiskNotes(mergedRisks); _riskNotes = mergedRisks; }
    if (mergedRiskLevel) { setRiskLevel(mergedRiskLevel); _riskLevel = mergedRiskLevel; }

    const doSubmit = async () => {
      try {
        // Upload pending files
        const pendingFilesStr = typeof window !== 'undefined' ? sessionStorage.getItem('wizardPendingFiles') : null;
        let photoUrls: string[] = Array.isArray(mergedInitial.photoUrls) ? mergedInitial.photoUrls : [];
        if (pendingFilesStr) {
          try {
            const pendingFiles = JSON.parse(pendingFilesStr) as { name: string; size: number; type: string }[];
            // Files can't be serialized to JSON — they're uploaded in wizard then passed as URLs
            // The photoUrls should already contain the uploaded URLs from buildWizardPayload
            if (Array.isArray(pendingFiles) && pendingFiles.length > 0) {
              // If there are pending files, they were already URL-ified by the wizard
              // The wizard's buildWizardPayload already uploaded them via the upload endpoint
            }
          } catch { /* best effort */ }
        }

        const region = mergedInitial.region || [
          mergedInitial.location?.primary,
          mergedInitial.location?.secondary,
        ].filter(Boolean).join(', ');

        const selectedProfessionals: any[] = Array.isArray(draft?.selectedProfessionals) ? draft.selectedProfessionals
          : Array.isArray(storedDraft?.selectedProfessionals) ? storedDraft.selectedProfessionals : [];
        const hasSelectedPros = selectedProfessionals.length > 0;

        const payload: any = {
          projectName: mergedInitial.projectName || 'New Project',
          clientName: mergedInitial.clientName || (user?.firstName && user?.surname ? `${user.firstName} ${user.surname}` : ''),
          region,
          notes: mergedInitial.notes || '',
          tradesRequired: Array.isArray(mergedInitial.tradesRequired) ? mergedInitial.tradesRequired : [],
          isEmergency: Boolean(mergedInitial.isEmergency),
          projectScale: mergedInitial.projectScale ?? undefined,
          endDate: mergedInitial.endDate ?? undefined,
          siteInspectionAvailableOn: mergedInitial.siteInspectionAvailableOn ?? undefined,
          requiresSurveyService: Boolean(mergedInitial.requiresSurveyService),
          requiresDesignService: Boolean(mergedInitial.requiresDesignService),
          photos: photoUrls.map((url: string) => ({ url })),
          userPrompt: mergedInitial.notes || null,
          aiIntakeId: draft?.aiIntakeId || storedDraft?.aiIntakeId || undefined,
          userId: user.id,
          onlySelectedProfessionalsCanBid: hasSelectedPros,
          ...(hasSelectedPros ? {
            professionalIds: selectedProfessionals.map((p: any) => p.id),
            professionalTradeScopes: selectedProfessionals.map((p: any) => ({
              professionalId: p.id,
              requestedTrades: Array.isArray(p.requestedTrades) ? p.requestedTrades : [],
            })),
          } : {}),
        };

        const res = await fetch(`${API_BASE_URL}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ message: 'Failed to create project' }));
          throw new Error(errData.message || `Server error: ${res.status}`);
        }
        const project = await res.json();

        // Open tender only if no specific professionals were selected
        if (!hasSelectedPros) {
          try {
            await fetch(`${API_BASE_URL}/projects/${project.id}/open-tender`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            });
          } catch (err) {
            console.warn('[submitting] open-tender failed (non-fatal):', (err as Error)?.message);
          }
        }

        clearCreateProjectDraftHandoff();
        clearProjectDescriptionHandoff();
        clearAiClientState();
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('createProjectDraft');
          sessionStorage.removeItem('projectDescription');
          sessionStorage.removeItem('wizardPendingFiles');
        }

        setCompletedProjectId(project.id);
        setCompletedSurveyStep(payload.requiresSurveyService === true);
        setSubmissionComplete(true);
        toast.success(hasSelectedPros
          ? 'Project created and bidding is now open to your selected professionals.'
          : 'Project created! Bidding is now open to all matching professionals.');
      } catch (err: any) {
        setError(err.message || 'Failed to create project');
        toast.error(err.message || 'Failed to create project');
        setIsSubmitting(false);
      }
    };

    doSubmit();
  }, [hydrated, isLoggedIn, user, accessToken]);

  if (!hydrated || isLoggedIn === undefined) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (isLoggedIn === false) return null;

  const resolvedSafety = safetyNotes.length > 0 ? safetyNotes : _safetyNotes;
  const resolvedRisks = riskNotes.length > 0 ? riskNotes : _riskNotes;
  const resolvedRiskLevel = riskLevel || _riskLevel;
  const hasSafety = resolvedSafety.length > 0 || resolvedRisks.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(81,55,32,0.35)] backdrop-blur-[1px]">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.92)] px-6 py-6 text-center shadow-2xl">
        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Spinner + status — hidden when expanded */}
        {!safetyExpanded && (
          <>
            <MimoSpinner size="md" className="mx-auto mb-3" />
            <p className="text-base font-bold text-[#4A3623]">Requesting quotes...</p>
            <p className="mt-1 text-sm text-[rgba(126,58,33,0.65)]">
              Inviting matching professionals and preparing your project dashboard.
            </p>
          </>
        )}

        {/* Safety tips */}
        {hasSafety && (
          <>
            <div className={safetyExpanded
              ? 'mt-4 max-h-[40vh] overflow-y-auto rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-left'
              : 'mt-4 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-left relative'
            }>
              <p className="text-xs font-semibold text-sky-800 mb-2">🛡️ Safety notes from your brief</p>
              {resolvedRiskLevel && ['medium', 'high', 'critical'].includes(resolvedRiskLevel) && (
                <p className="text-xs font-medium text-amber-700 mb-1">
                  ⚠️ {resolvedRiskLevel === 'critical' ? 'Critical' : resolvedRiskLevel === 'high' ? 'High' : 'Medium'} risk detected
                </p>
              )}
              {(safetyExpanded ? resolvedSafety : resolvedSafety.slice(0, 3)).map((note, i) => (
                <p key={`safety-${i}`} className="text-xs text-sky-700 mt-1 flex gap-1.5">
                  <span className="shrink-0">🛡️</span><span>{note}</span>
                </p>
              ))}
              {(safetyExpanded ? resolvedRisks : resolvedRisks.slice(0, 3)).map((note, i) => (
                <p key={`risk-${i}`} className="text-xs text-amber-700 mt-1 flex gap-1.5">
                  <span className="shrink-0">⚠️</span><span>{note}</span>
                </p>
              ))}
              {!safetyExpanded && (resolvedSafety.length + resolvedRisks.length) > 6 && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-sky-50/95 to-transparent rounded-b-xl pointer-events-none" />
              )}
            </div>

            <div className="mt-3">
              {!safetyExpanded && (resolvedSafety.length + resolvedRisks.length) > 6 && (
                <button
                  type="button"
                  onClick={() => {
                    if (autoRedirectTimerRef.current) clearTimeout(autoRedirectTimerRef.current);
                    setSafetyExpanded(true);
                  }}
                  className="w-full rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                >
                  Read more
                </button>
              )}
              {safetyExpanded && (
                <button
                  type="button"
                  disabled={!submissionComplete}
                  onClick={handleSafetyDismiss}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submissionComplete ? 'OK, take me to my project' : 'Finalizing your project...'}
                </button>
              )}
            </div>
          </>
        )}

        {/* No safety data — immediate redirect */}
        {!hasSafety && submissionComplete && completedProjectId && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleSafetyDismiss}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Take me to my project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
