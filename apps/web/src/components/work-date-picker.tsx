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
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMondayOfWeek(d: Date): Date {
  const monday = new Date(d);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday → back 6, else back to Monday
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WorkDatePicker({
  value,
  onChange,
  isEmergency = false,
  minDate,
  maxDate,
  disabledDates: extraDisabled = [],
  className = '',
}: WorkDatePickerProps) {
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [currentMonth, setCurrentMonth] = useState<string>('');
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useEffect(() => {
    getHolidayDateSet().then(setHolidays);
  }, []);

  const startDate = useMemo(() => getMondayOfWeek(new Date()), []);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Generate 28 days (4 weeks)
  const weeks = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    // Detect if we span two months
    const months = new Set(days.map((d) => d.getMonth()));
    if (months.size > 1) {
      // Find the split point — last day of first month
      const lastOfFirst = [...days].reverse().find((d) => d.getMonth() === startDate.getMonth());
      const nextMonthDate = days.find((d) => d.getMonth() !== startDate.getMonth());
      if (nextMonthDate) {
        setCurrentMonth(
          new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth()).toLocaleDateString(
            'en-HK',
            { month: 'long', year: 'numeric' },
          ),
        );
      }
    } else {
      setCurrentMonth('');
    }

    // Group into weeks
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [startDate]);

  const disabledSet = useMemo(
    () => new Set(extraDisabled),
    [extraDisabled],
  );

  const isDisabled = useCallback(
    (d: Date): boolean => {
      const key = toDateKey(d);
      // Min date check
      if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
        return true;
      }
      // Max date check
      if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) {
        return true;
      }
      // Sunday check (skip for emergencies)
      if (!isEmergency && isSunday(key)) return true;
      // Holiday check
      if (holidays.has(key)) return true;
      // Extra disabled
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

      const base =
        'w-9 h-9 rounded-lg text-sm font-medium flex items-center justify-center transition select-none';

      if (disabled) {
        return `${base} text-slate-300 cursor-not-allowed`;
      }

      if (isSelected) {
        return `${base} bg-emerald-600 text-white shadow-md cursor-pointer`;
      }

      if (isToday) {
        return `${base} border-2 border-amber-500 text-[#4A3623] cursor-pointer hover:bg-amber-100`;
      }

      if (isSun && !isEmergency) {
        return `${base} text-[#FF7F50]/50 line-through cursor-not-allowed`;
      }

      if (isHoliday) {
        return `${base} text-[#FF7F50] cursor-not-allowed relative`;
      }

      if (isNextMonth) {
        return `${base} text-[rgba(126,58,33,0.4)] cursor-pointer hover:bg-[rgba(245,238,219,0.6)]`;
      }

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

  const headerMonth = startDate.toLocaleDateString('en-HK', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={`select-none ${className}`}>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="text-base font-bold text-[#4A3623]">{headerMonth}</p>
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

      {/* Day grid */}
      <div className="space-y-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((d, di) => {
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
                  {/* Holiday indicator dot */}
                  {isHoliday && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#FF7F50]" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Subtitle for next month boundary */}
      {currentMonth && (
        <p className="mt-2 text-center text-xs font-medium text-[rgba(126,58,33,0.45)]">
          {currentMonth} →
        </p>
      )}

      {/* Selected date display */}
      {value && (
        <p className="mt-3 text-center text-sm font-semibold text-[#4A3623]">
          {value.toLocaleDateString('en-HK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}
