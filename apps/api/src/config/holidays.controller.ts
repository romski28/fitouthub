import { Controller, Get, Query } from '@nestjs/common';
import { getHolidayDateSet, getHolidayForDate, getHolidaysForYear } from './hk-public-holidays';

@Controller('holidays')
export class HolidaysController {
  /** GET /holidays?year=2026 — all holidays for a year */
  @Get()
  getHolidays(@Query('year') year?: string) {
    if (year) {
      return { holidays: getHolidaysForYear(Number(year)) };
    }
    // Return all dates as a simple array for the picker
    return { dates: Array.from(getHolidayDateSet()) };
  }

  /** GET /holidays/check?date=2026-07-01 — check a single date */
  @Get('check')
  checkDate(@Query('date') date?: string) {
    if (!date) return { isHoliday: false };
    const holiday = getHolidayForDate(date);
    return { isHoliday: Boolean(holiday), holiday: holiday ?? null };
  }
}
