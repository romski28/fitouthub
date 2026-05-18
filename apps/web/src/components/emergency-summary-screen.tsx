'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import type { Professional } from '@/lib/types';
import { SafetyGuidanceCard, parseSafetyGuidanceText } from '@/components/safety-guidance-card';

interface EmergencyContext {
  trade: string;
  location: string;
  notes: string;
  aiTitle?: string;
  aiWarnings?: string;
  aiIntakeId?: string;
}

interface Props {
  isOpen: boolean;
  onBack: () => void;
  selectedProfessionals: Professional[];
  emergencyContext: EmergencyContext;
}

export function EmergencySummaryScreen({ isOpen, onBack, selectedProfessionals, emergencyContext }: Props) {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const displayTitle = emergencyContext.aiTitle || `Emergency: ${emergencyContext.trade}`;
  const hasWarnings = Boolean(emergencyContext.aiWarnings);
  const hasAiResult = Boolean(emergencyContext.aiTitle || emergencyContext.aiWarnings || emergencyContext.aiIntakeId);
  const parsedWarnings = parseSafetyGuidanceText(emergencyContext.aiWarnings);
  const canConfirm = hasAiResult && selectedProfessionals.length > 0 && !sending;
  const clientName = `${user?.firstName || ''} ${user?.surname || ''}`.trim() || user?.nickname?.trim() || 'Client';

  const handleConfirm = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          projectName: displayTitle,
          clientName,
          notes: emergencyContext.notes,
          region: emergencyContext.location,
          tradesRequired: [emergencyContext.trade],
          isEmergency: true,
          aiIntakeId: emergencyContext.aiIntakeId,
          professionalIds: selectedProfessionals.map((p) => p.id),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || `Request failed (${res.status})`);
      }

      const project = await res.json();
      const projectId: string = project?.id ?? project?.data?.id;

      // Toast-style notification
      const toast = document.createElement('div');
      toast.textContent = `✓ Invites sent to ${selectedProfessionals.length} professional${selectedProfessionals.length !== 1 ? 's' : ''}`;
      toast.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a6b3c;color:#fff;padding:12px 24px;border-radius:999px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.18);font-size:14px;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);

      router.push(`/projects/${encodeURIComponent(projectId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onBack} />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#FCF8EE] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#DC143C] px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-100">Emergency Project</p>
            <h2 className="text-lg font-bold text-white leading-tight">Confirm &amp; Send Invites</h2>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Project title */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Project Title</p>
            <p className="text-base font-semibold text-slate-900">{displayTitle}</p>
            {!hasAiResult && (
              <p className="text-xs text-slate-400 mt-0.5 italic">Waiting for AI title and safety guidance…</p>
            )}
            {hasAiResult && !emergencyContext.aiTitle && emergencyContext.aiIntakeId && (
              <p className="text-xs text-emerald-700 mt-0.5 italic">AI response received and linked.</p>
            )}
          </div>

          {/* Description */}
          {emergencyContext.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Description</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{emergencyContext.notes}</p>
            </div>
          )}

          {/* AI Warnings */}
          {hasWarnings && (
            <SafetyGuidanceCard guidance={parsedWarnings} />
          )}

          {hasAiResult && !hasWarnings && emergencyContext.aiIntakeId && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-1">AI Intake</p>
              <p className="text-sm text-emerald-800">AI analysis has been received and attached to this emergency project.</p>
            </div>
          )}

          {/* Selected professionals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
              Inviting {selectedProfessionals.length} Professional{selectedProfessionals.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-2">
              {selectedProfessionals.map((pro) => (
                <li key={pro.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                    {(pro.businessName || pro.fullName || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {pro.businessName || pro.fullName || 'Professional'}
                    </p>
                    {pro.primaryTrade && (
                      <p className="truncate text-xs text-slate-500">{pro.primaryTrade}</p>
                    )}
                  </div>
                  {pro.emergencyCalloutAvailable && (
                    <span className="ml-auto flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      24/7
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Response expectation note */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            ⏱ Professionals will be notified immediately and are expected to respond within <strong>1 hour</strong>.
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center gap-3 bg-[#FCF8EE]">
          <button
            onClick={onBack}
            disabled={sending}
            className="flex-1 rounded-full border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Back
          </button>
          <div className="flex-[2]">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="w-full rounded-full bg-[#DC143C] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#b01030] disabled:opacity-50"
            >
              {sending ? 'Sending…' : `Confirm & Send ${selectedProfessionals.length > 0 ? `(${selectedProfessionals.length})` : ''}`}
            </button>
            {!hasAiResult && (
              <p className="mt-2 text-center text-xs text-slate-500">Waiting for AI brief before invites can be sent.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
