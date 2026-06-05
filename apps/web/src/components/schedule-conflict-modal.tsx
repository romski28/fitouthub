'use client';

import React from 'react';
import Link from 'next/link';

interface ConflictItem {
  id: string;
  title: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  startTimeSlot?: string;
  endTimeSlot?: string;
  projectName: string;
}

interface AvailabilityInfo {
  warnings: string[];
  suggestions: string[];
}

interface ScheduleConflictModalProps {
  isOpen: boolean;
  conflicts: ConflictItem[] | null;
  availability: AvailabilityInfo | null;
  onDismiss: () => void;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '?';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const ScheduleConflictModal: React.FC<ScheduleConflictModalProps> = ({
  isOpen,
  conflicts,
  availability,
  onDismiss,
}) => {
  if (!isOpen) return null;

  const hasConflicts = conflicts && conflicts.length > 0;
  const hasAvailability = availability && availability.warnings.length > 0;

  if (!hasConflicts && !hasAvailability) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#FEFCF7] rounded-2xl border border-[rgba(45,36,32,0.1)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 border-b ${hasConflicts ? 'border-amber-200 bg-amber-50/80' : 'border-blue-200 bg-blue-50/80'}`}>
          <h2 className={`text-lg font-bold ${hasConflicts ? 'text-amber-900' : 'text-blue-900'}`}>
            {hasConflicts ? '⚠ Scheduling conflict' : '💡 Availability note'}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {hasConflicts && (
            <div>
              <p className="text-sm text-[rgba(45,36,32,0.85)] mb-2">
                This milestone overlaps with:
              </p>
              <ul className="space-y-1.5">
                {conflicts!.map((c) => {
                  const start = formatDate(c.plannedStartDate);
                  const end = formatDate(c.plannedEndDate);
                  const slot = c.startTimeSlot ? ` (${c.startTimeSlot})` : '';
                  return (
                    <li key={c.id} className="text-sm text-[rgba(45,36,32,0.75)] bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                      <span className="font-semibold text-[#2D2420]">{c.title}</span>
                      <span className="text-[rgba(45,36,32,0.45)]"> on </span>
                      <span className="font-medium text-[#B94E2D]">{c.projectName}</span>
                      <br />
                      <span className="text-xs text-[rgba(45,36,32,0.5)]">{start}{end !== start ? ` – ${end}` : ''}{slot}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {hasAvailability && (
            <div>
              {availability!.warnings.map((w, i) => (
                <p key={i} className="text-sm text-[rgba(45,36,32,0.85)]">{w}</p>
              ))}
              {availability!.suggestions.map((s, i) => (
                <p key={`s-${i}`} className="text-sm text-[rgba(45,36,32,0.7)] font-medium mt-1">{s}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-[rgba(45,36,32,0.4)]">
            You can still proceed — this is a heads-up, not a block.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[rgba(45,36,32,0.06)] bg-[rgba(239,231,207,0.3)]">
          <Link
            href="/professional/calendar"
            className="rounded-lg border border-[rgba(45,36,32,0.1)] px-4 py-2 text-sm font-semibold text-[rgba(45,36,32,0.7)] hover:bg-[rgba(45,36,32,0.04)] transition"
          >
            View calendar
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-[#B94E2D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#A04025] transition"
          >
            OK, got it
          </button>
        </div>
      </div>
    </div>
  );
};
