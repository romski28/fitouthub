'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getHolidayDateSet, isSunday, toDateKey } from '@/lib/hk-holidays';

interface WorkDatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  isEmergency?: boolean;
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: string[]; // YYYY-MM-DD strings
  className?: string;
  /** Number of weeks to display (default 4) */
  weeks?: number;
  /** Show forward/back navigation (default true) */
  showNav?: boolean;
  /** Make cells fill available width (default false) */
  fullWidth?: boolean;
  /** Prefix text shown before the selected date in the header (e.g. "I can start on ") */
  headerPrefix?: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMondayOfWeek(d: Date): Date {
  const monday = new Date(d);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-HK', { month: 'long', year: 'numeric' });
}

function formatMonthShort(d: Date): string {
  return d.toLocaleDateString('en-HK', { month: 'short' });
}

export function WorkDatePicker({
  value,
  onChange,
  isEmergency = false,
  minDate,
  maxDate,
  disabledDates: extraDisabled = [],
  className = '',
  weeks: totalWeeks = 4,
  showNav = true,
  fullWidth = false,
  headerPrefix = '',
}: WorkDatePickerProps) {
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [weekOffset, setWeekOffset] = useState(0);
  const [animDir, setAnimDir] = useState<'left' | 'right' | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useEffect(() => {
    getHolidayDateSet().then(setHolidays);
  }, []);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Starting Monday = this week's Monday + offset * displayed weeks
  const startDate = useMemo(() => {
    const base = getMondayOfWeek(new Date());
    return addDays(base, weekOffset * 7 * totalWeeks);
  }, [weekOffset, totalWeeks]);

  const totalDays = totalWeeks * 7;

  // Generate days
  const weeks = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(startDate, i));
    }

    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [startDate, totalDays]);

  // Header label
  const headerLabel = useMemo(() => {
    const endDate = addDays(startDate, totalDays - 1);
    const startMonth = formatMonthYear(startDate);
    const endMonth = formatMonthYear(endDate);
    if (startMonth === endMonth) return startMonth;
    return `${startMonth} – ${endMonth}`;
  }, [startDate, totalDays]);

  // Next-month subtitle
  const nextMonthLabel = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) days.push(addDays(startDate, i));
    const months = new Set(days.map((d) => d.getMonth()));
    if (months.size > 1) {
      const firstMonth = formatMonthShort(startDate);
      const lastDay = addDays(startDate, totalDays - 1);
      const lastMonth = formatMonthShort(lastDay);
      return `${firstMonth} / ${lastMonth}`;
    }
    return formatMonthShort(startDate);
  }, [startDate, totalDays]);

  const disabledSet = useMemo(() => new Set(extraDisabled), [extraDisabled]);

  const isDisabled = useCallback(
    (d: Date): boolean => {
      const key = toDateKey(d);
      if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
        return true;
      }
      if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) {
        return true;
      }
      if (!isEmergency && isSunday(key)) return true;
      if (holidays.has(key)) return true;
      if (disabledSet.has(key)) return true;
      return false;
    },
    [holidays, disabledSet, isEmergency, minDate, maxDate],
  );

  const getDayClasses = useCallback(
    (d: Date): string => {
      const key = toDateKey(d);
      const disabled = isDisabled(d);
      const isToday = key === todayKey;
      const isSelected = value ? sameDay(d, value) : false;
      const isNextMonth = d.getMonth() !== startDate.getMonth();
      const isSun = isSunday(key);
      const isHoliday = holidays.has(key);

      const base = fullWidth
        ? 'w-full aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition select-none'
        : 'w-9 h-9 rounded-lg text-sm font-medium flex items-center justify-center transition select-none';

      if (disabled) return `${base} text-slate-300 cursor-not-allowed`;
      if (isSelected) return `${base} bg-emerald-600 text-white shadow-md cursor-pointer`;
      if (isToday) return `${base} border-2 border-amber-500 text-[#4A3623] cursor-pointer hover:bg-amber-100`;
      if (isSun && !isEmergency) return `${base} text-[#FF7F50]/50 line-through cursor-not-allowed`;
      if (isHoliday) return `${base} text-[#FF7F50] cursor-not-allowed relative`;
      if (isNextMonth) return `${base} text-[rgba(126,58,33,0.4)] cursor-pointer hover:bg-[rgba(245,238,219,0.6)]`;
      return `${base} text-[#4A3623] cursor-pointer hover:bg-[rgba(245,238,219,0.8)]`;
    },
    [value, todayKey, startDate, isEmergency, holidays, isDisabled],
  );

  const handleDayClick = useCallback(
    (d: Date) => {
      if (isDisabled(d)) return;
      onChange(d);
    },
    [isDisabled, onChange],
  );

  const navBack = useCallback(() => {
    if (weekOffset <= 0) return;
    setAnimDir('right');
    setWeekOffset((o) => o - 1);
    setTimeout(() => setAnimDir(null), 200);
  }, [weekOffset]);

  const navForward = useCallback(() => {
    setAnimDir('left');
    setWeekOffset((o) => o + 1);
    setTimeout(() => setAnimDir(null), 200);
  }, []);

  const canGoBack = weekOffset > 0;

  // Check if any pickable dates exist beyond the current window
  const lastDayInView = addDays(startDate, totalDays - 1);
  const hasFuturePickable = useMemo(() => {
    // Check a few days past the visible window — if all disabled, hide forward arrow
    for (let i = 1; i <= 7; i++) {
      const d = addDays(lastDayInView, i);
      if (!isDisabled(d)) return true;
    }
    return false;
  }, [lastDayInView, isDisabled]);

  // Should show nav at all?
  const showNavigation = showNav && (canGoBack || hasFuturePickable);

  // Header text
  const headerText = value
    ? `${headerPrefix}${value.toLocaleDateString('en-HK', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : 'Select a date';

  return (
    <div className={`select-none rounded-xl bg-[#F5EEDE] p-4 ${className}`}>
      {/* Header: selected date */}
      <div className="mb-3 text-center">
        <p className={`text-sm font-semibold ${value ? 'text-[#4A3623]' : 'text-[rgba(126,58,33,0.5)]'}`}>
          {headerText}
        </p>
      </div>

      {/* Day names */}
      <div className="mb-1 grid grid-cols-7">
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={`text-center text-[11px] font-semibold uppercase tracking-wide ${
              i === 6 ? 'text-[#FF7F50]/70' : 'text-[rgba(126,58,33,0.5)]'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day grid with transition */}
      <div
        className={`space-y-0.5 transition-opacity duration-150 ${
          animDir ? 'opacity-40' : 'opacity-100'
        }`}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((d) => {
              const key = toDateKey(d);
              const disabled = isDisabled(d);
              const isHoliday = holidays.has(key);

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(d)}
                  onMouseEnter={() => setHoveredDate(key)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={getDayClasses(d)}
                  title={
                    isHoliday
                      ? 'Public holiday'
                      : isSunday(key) && !isEmergency
                        ? 'Sunday — not available'
                        : disabled
                          ? 'Not available'
                          : toDateKey(d)
                  }
                >
                  {d.getDate()}
                  {isHoliday && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#FF7F50]" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Navigation arrows — below the grid */}
      {showNavigation && (
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={navBack}
            disabled={!canGoBack}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              canGoBack
                ? 'text-[#4A3623] hover:bg-[rgba(245,238,219,0.8)] cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            aria-label="Previous weeks"
          >
            ←
          </button>
          <span className="text-xs text-[rgba(126,58,33,0.4)]">{headerLabel}</span>
          <button
            type="button"
            onClick={navForward}
            disabled={!hasFuturePickable}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              hasFuturePickable
                ? 'text-[#4A3623] hover:bg-[rgba(245,238,219,0.8)] cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            aria-label="Next weeks"
          >
            →
          </button>
        </div>
      )}

      {/* Next month subtitle */}
      {nextMonthLabel && (
        <p className="mt-2 text-center text-xs font-medium text-[rgba(126,58,33,0.45)]">
          {nextMonthLabel} →
        </p>
      )}
    </div>
  );
}
