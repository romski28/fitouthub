'use client';

const DEFECT_PERIOD_MONTHS = 3; // matches RETENTION_MONTHS on the API

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Guard against month-length overflow (e.g. 31 Jan -> 3 Mar).
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

export function WarrantyCountdown({
  stage,
  stageStartedAt,
}: {
  stage?: string | null;
  stageStartedAt?: string | null;
}) {
  const isWarranty = String(stage || '').toLowerCase() === 'warranty_period';
  if (!isWarranty || !stageStartedAt) return null;

  const start = new Date(stageStartedAt);
  if (Number.isNaN(start.getTime())) return null;

  const end = addMonths(start, DEFECT_PERIOD_MONTHS);
  const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
      🛡️ {days} day{days === 1 ? '' : 's'} remaining in defects period
    </span>
  );
}
