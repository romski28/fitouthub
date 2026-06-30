// HK public holidays 2026–2027
// Source: https://www.gov.hk/en/about/abouthk/holiday/
// Update annually — add the next year before December.

export interface PublicHoliday {
  date: string;   // YYYY-MM-DD
  name: string;   // English name
}

const HOLIDAYS_2026: PublicHoliday[] = [
  { date: '2026-01-01', name: 'New Year\'s Day' },
  { date: '2026-02-16', name: 'Lunar New Year\'s Eve' },
  { date: '2026-02-17', name: 'Lunar New Year\'s Day' },
  { date: '2026-02-18', name: 'Third day of Lunar New Year' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-04', name: 'Day following Good Friday' },
  { date: '2026-04-05', name: 'Easter Sunday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-04-07', name: 'Ching Ming Festival' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-24', name: 'Birthday of the Buddha' },
  { date: '2026-06-18', name: 'Tuen Ng Festival' },
  { date: '2026-07-01', name: 'Hong Kong SAR Establishment Day' },
  { date: '2026-09-25', name: 'Day following Mid-Autumn Festival' },
  { date: '2026-10-01', name: 'National Day' },
  { date: '2026-10-18', name: 'Chung Yeung Festival' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Day following Christmas' },
];

const HOLIDAYS_2027: PublicHoliday[] = [
  { date: '2027-01-01', name: 'New Year\'s Day' },
  { date: '2027-02-05', name: 'Lunar New Year\'s Eve' },
  { date: '2027-02-06', name: 'Lunar New Year\'s Day' },
  { date: '2027-02-07', name: 'Third day of Lunar New Year' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-03-27', name: 'Day following Good Friday' },
  { date: '2027-03-28', name: 'Easter Sunday' },
  { date: '2027-03-29', name: 'Easter Monday' },
  { date: '2027-04-05', name: 'Ching Ming Festival' },
  { date: '2027-05-01', name: 'Labour Day' },
  { date: '2027-05-13', name: 'Birthday of the Buddha' },
  { date: '2027-06-07', name: 'Tuen Ng Festival' },
  { date: '2027-07-01', name: 'Hong Kong SAR Establishment Day' },
  { date: '2027-09-14', name: 'Day following Mid-Autumn Festival' },
  { date: '2027-10-01', name: 'National Day' },
  { date: '2027-10-08', name: 'Chung Yeung Festival' },
  { date: '2027-12-25', name: 'Christmas Day' },
  { date: '2027-12-27', name: 'Day following Christmas' },
];

const ALL_HOLIDAYS: PublicHoliday[] = [...HOLIDAYS_2026, ...HOLIDAYS_2027];

/** Get all holiday dates as a Set of YYYY-MM-DD strings (fast lookup) */
export function getHolidayDateSet(): Set<string> {
  return new Set(ALL_HOLIDAYS.map((h) => h.date));
}

/** Get holiday info for a specific date, or null if not a holiday */
export function getHolidayForDate(dateStr: string): PublicHoliday | null {
  return ALL_HOLIDAYS.find((h) => h.date === dateStr) ?? null;
}

/** Get all holidays for a given year */
export function getHolidaysForYear(year: number): PublicHoliday[] {
  return ALL_HOLIDAYS.filter((h) => h.date.startsWith(String(year)));
}

export { ALL_HOLIDAYS };
