'use client';

import { API_BASE_URL } from '@/config/api';

let cachedHolidaySet: Set<string> | null = null;
let fetchPromise: Promise<Set<string>> | null = null;

/** Fetch HK public holiday dates once, cache indefinitely */
export async function getHolidayDateSet(): Promise<Set<string>> {
  if (cachedHolidaySet) return cachedHolidaySet;

  // Deduplicate concurrent calls
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/holidays`);
      if (!res.ok) throw new Error('Failed to fetch holidays');
      const data = await res.json();
      cachedHolidaySet = new Set<string>(data.dates || []);
      return cachedHolidaySet;
    } catch {
      // Fallback: return empty set so nothing is blocked
      cachedHolidaySet = new Set<string>();
      return cachedHolidaySet;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/** Check if a YYYY-MM-DD string is a Sunday */
export function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}

/** Format a Date as YYYY-MM-DD */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add N working days (skip Sundays + holidays) to a date */
export function addWorkingDays(
  start: Date,
  days: number,
  holidays: Set<string>,
  skipSundays: boolean = true,
): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const key = toDateKey(result);
    const sunday = skipSundays && isSunday(key);
    if (!sunday && !holidays.has(key)) {
      added++;
    }
  }
  return result;
}
