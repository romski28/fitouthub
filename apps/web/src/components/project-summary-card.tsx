'use client';

import React from 'react';

export interface ProjectSummaryCardProps {
  projectName: string;
  location?: string;
  trades?: string[];
  scope?: string;
  isEmergency?: boolean;
  siteInspectionDate?: string;
  completionTarget?: string;
  projectScale?: string | null;
  budget?: string | number;
  compact?: boolean;
}

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-HK', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatHKD = (value?: string | number) => {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return value ? `HK$ ${value}` : null;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatProjectClass = (value?: string | null) => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'SCALE_1') return 'Class 1';
  if (normalized === 'SCALE_2') return 'Class 2';
  if (normalized === 'SCALE_3') return 'Class 3';
  return null;
};

export const ProjectSummaryCard: React.FC<ProjectSummaryCardProps> = ({
  projectName,
  location,
  trades,
  scope,
  isEmergency,
  siteInspectionDate,
  completionTarget,
  projectScale,
  budget,
  compact = false,
}) => {
  const scaleLabel = formatProjectClass(projectScale);
  const budgetLabel = formatHKD(budget);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">Project Overview</p>
        <h3 className="text-base font-bold text-emerald-900">
          {projectName?.trim() || 'Untitled project'}
        </h3>
      </div>

      <div className="space-y-1.5 text-sm text-slate-700">
        {location && (
          <p>
            <span className="font-semibold text-slate-900">Location:</span> {location}
          </p>
        )}
        {trades && trades.length > 0 && (
          <p>
            <span className="font-semibold text-slate-900">Trades:</span> {trades.join(', ')}
          </p>
        )}
        {scope && (
          <p>
            <span className="font-semibold text-slate-900">Scope:</span> {scope}
          </p>
        )}
        {scaleLabel && (
          <p>
            <span className="font-semibold text-slate-900">Class:</span> {scaleLabel}
          </p>
        )}
        {budgetLabel && !compact && (
          <p>
            <span className="font-semibold text-slate-900">Budget:</span> {budgetLabel}
          </p>
        )}
        {!compact && (
          <>
            <p>
              <span className="font-semibold text-slate-900">Priority:</span>{' '}
              {isEmergency ? '🚨 Emergency' : 'Standard'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Site inspection:</span>{' '}
              {formatDate(siteInspectionDate)}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Target completion:</span>{' '}
              {formatDate(completionTarget)}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
