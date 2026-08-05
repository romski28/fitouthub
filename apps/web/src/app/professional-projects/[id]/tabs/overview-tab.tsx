'use client';

import React, { useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { ProjectAiPanel } from '@/components/project-ai-panel';
import { ProjectAiScopePanel } from '@/components/project-ai-scope-panel';
import { getProjectScope } from '@/lib/project-scope';
import {
  getQuoteBreakdownBaseTotal,
  type StoredQuoteBreakdown,
} from '@/lib/quote-breakdown';

interface OverviewTabProps {
  tab?: string;
  project: {
    id: string;
    quoteRequestedTrades?: string[];
    projectTradesSnapshot?: string[];
    project: {
      id: string;
      projectName: string;
      clientName: string;
      region: string;
      isEmergency?: boolean;
      budget?: string;
      notes?: string;
      aiIntake?: {
        id?: string;
        summary?: string;
        scope?: string;
        title?: string;
        assumptions?: unknown;
        risks?: unknown;
        project?: unknown;
      } | null;
      mimoProjectExtras?: Array<{
        id: string;
        extraType: 'survey' | 'design' | string;
        status: string;
        price?: number | string | null;
        currency?: string | null;
        requestedAt?: string;
        scheduledAt?: string | null;
      }>;
    };
    status: string;
    quoteAmount?: string;
    quoteBaseAmount?: string;
    quoteBreakdown?: StoredQuoteBreakdown | null;
    quoteNotes?: string;
    quoteEstimatedStartAt?: string;
    quoteEstimatedDurationMinutes?: number;
    quoteEstimatedDurationUnit?: 'hours' | 'days';
    quotedAt?: string;
    createdAt?: string;
    quoteReminderSentAt?: string;
    quoteExtendedUntil?: string;
    updatedAt?: string;
  };
  onOpenQuoteModal: () => void;
  onKeepCurrentQuote: () => Promise<void>;
  onOpenAccessSchedule?: () => void;
  accessToken?: string | null;
  projectId?: string;
}

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const formatDuration = (minutes?: number) => {
  if (!minutes || !Number.isFinite(minutes)) return '—';
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours`;
  }
  return `${minutes} min`;
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const formatHKD = (value?: number | string): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '—';
  return `HK$${num.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const formatExtraTypeLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'survey') return 'Mimo Surveying+';
  if (normalized === 'design') return 'Mimo Interior Design';
  return value || 'Mimo service';
};

const formatExtraStatusLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized.replace(/_/g, ' ');
};

const getExtraStatusClasses = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (['scheduled', 'in_progress'].includes(normalized)) {
    return 'border-sky-300 bg-sky-50 text-sky-700';
  }
  if (normalized === 'completed') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (['declined', 'cancelled'].includes(normalized)) {
    return 'border-rose-300 bg-rose-50 text-rose-700';
  }
  return 'border-amber-300 bg-amber-50 text-amber-700';
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  onOpenQuoteModal,
  onKeepCurrentQuote,
  onOpenAccessSchedule,
  accessToken,
  projectId,
}) => {
  const hasQuoted = Boolean(project.quotedAt);
  const isDeclinedOrRejected = project.status === 'declined' || project.status === 'rejected';
  const isCounterRequested = project.status === 'counter_requested';
  const isEmergencyProject = project.project.isEmergency === true;
  const showQuoteCard = !isDeclinedOrRejected && (hasQuoted || ['pending', 'accepted', 'counter_requested'].includes(project.status));
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({ 'project-overview': true });

  const requestedTradeScope = Array.isArray(project.quoteRequestedTrades)
    ? project.quoteRequestedTrades.filter((trade) => typeof trade === 'string' && trade.trim().length > 0)
    : [];
  const projectTradeScope = Array.isArray(project.projectTradesSnapshot)
    ? project.projectTradesSnapshot.filter((trade) => typeof trade === 'string' && trade.trim().length > 0)
    : [];
  const mimoExtras = Array.isArray(project.project.mimoProjectExtras)
    ? project.project.mimoProjectExtras
    : [];
  const existingBreakdownTotal = getQuoteBreakdownBaseTotal(project.quoteBreakdown, project.quoteBaseAmount || project.quoteAmount);

  return (
    <AccordionGroup>
      {/* Project Overview */}
      <AccordionItem
        id="project-overview"
        title="Project Overview"
        isOpen={expandedAccordions['project-overview'] !== false}
        onToggle={(id) => setExpandedAccordions((prev) => ({ ...prev, [id]: !prev[id] }))}
      >
        <div className="space-y-2 text-sm text-slate-700">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <p><span className="font-semibold text-slate-900">Project:</span> {project.project.projectName}</p>
            <p><span className="font-semibold text-slate-900">Client:</span> {project.project.clientName}</p>
            <p><span className="font-semibold text-slate-900">Region:</span> {project.project.region}</p>
          </div>
          {project.project.budget && (
            <p><span className="font-semibold text-slate-900">Budget:</span> HK$ {Number(project.project.budget).toLocaleString()}</p>
          )}
          {project.project.isEmergency && (
            <p><span className="font-semibold text-slate-900">Priority:</span> 🚨 Emergency</p>
          )}
          {(() => { const scope = getProjectScope({ notes: project.project.notes, aiIntake: project.project.aiIntake as any }); return scope ? (
            <div>
              <p className="font-semibold text-slate-900 mb-1">Scope:</p>
              <p className="leading-relaxed text-slate-700">{scope}</p>
            </div>
          ) : null; })()}
          {((project.projectTradesSnapshot && project.projectTradesSnapshot.length > 0) || (project.quoteRequestedTrades && project.quoteRequestedTrades.length > 0)) && (
            <div>
              <p className="font-semibold text-slate-900 mb-1.5">Trades:</p>
              <div className="flex flex-wrap gap-1.5">
                {projectTradeScope.map((trade) => {
                  const isProTrade = requestedTradeScope.some((rt) => rt.toLowerCase() === trade.toLowerCase());
                  return (
                    <span
                      key={`overview-trade-${trade}`}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isProTrade ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.82)] text-slate-500'}`}
                    >
                      {trade}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </AccordionItem>

      {mimoExtras.length > 0 && (
        <AccordionItem
          id="mimo-services"
          title="Mimo Added Services"
          isOpen={expandedAccordions['mimo-services'] !== false}
          onToggle={(id) => setExpandedAccordions((prev) => ({ ...prev, [id]: !prev[id] }))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {mimoExtras.map((extra) => (
              <div
                key={extra.id}
                className="rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.72)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{formatExtraTypeLabel(extra.extraType)}</p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getExtraStatusClasses(extra.status)}`}
                  >
                    {formatExtraStatusLabel(extra.status)}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {extra.price ? (
                    <p>
                      Price: {String(extra.currency || 'HKD').toUpperCase()} {Number(extra.price).toLocaleString('en-HK')}
                    </p>
                  ) : null}
                  {extra.requestedAt ? <p>Requested: {formatDateTime(extra.requestedAt)}</p> : null}
                  {extra.scheduledAt ? <p>Scheduled: {formatDateTime(extra.scheduledAt)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </AccordionItem>
      )}

      {/* Your Quote */}
      {showQuoteCard && (
        <AccordionItem
          id="your-quote"
          title={hasQuoted ? 'Your Quote' : 'Submit Your Quote'}
          isOpen={expandedAccordions['your-quote'] !== false}
          onToggle={(id) => setExpandedAccordions((prev) => ({ ...prev, [id]: !prev[id] }))}
        >
          {!hasQuoted ? (
            <div className="flex items-center justify-between py-2">
              <p className="text-sm text-slate-500">No bid made yet</p>
              <button
                type="button"
                onClick={onOpenQuoteModal}
                className="rounded-lg bg-[#FF7F50] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E67245] transition"
              >
                Submit quote
              </button>
            </div>
          ) : (
            <>
              {isCounterRequested && (
                <div className="mb-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                  The client requested a revised offer.
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{formatHKD(existingBreakdownTotal || project.quoteAmount)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Submitted {project.quotedAt ? new Date(project.quotedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenQuoteModal}
                  className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
                >
                  View quote
                </button>
              </div>
            </>
          )}
        </AccordionItem>
      )}

      {project.project.aiIntake && (
        <AccordionItem
          id="safety-risks"
          title="Safety, Assumptions and Risks"
          isOpen={expandedAccordions['safety-risks'] === true}
          onToggle={(id) => setExpandedAccordions((prev) => ({ ...prev, [id]: !prev[id] }))}
        >
          <ProjectAiPanel aiIntake={project.project.aiIntake} mode="professional" />
        </AccordionItem>
      )}

      {accessToken && projectId && (
        <AccordionItem
          id="programme-of-works"
          title="Programme of Works"
            isOpen={expandedAccordions['programme-of-works'] !== false}
          onToggle={(id) => setExpandedAccordions((prev) => ({ ...prev, [id]: !prev[id] }))}
        >
          <ProjectAiScopePanel
            projectId={projectId}
            accessToken={accessToken}
            mode="professional"
          />
        </AccordionItem>
      )}
    </AccordionGroup>
  );
};
