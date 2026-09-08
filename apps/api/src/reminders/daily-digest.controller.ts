import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { ReminderService } from './reminder.service';

/**
 * App-facing endpoint for the in-app "Today" digest card. Accepts both client
 * and professional tokens (via CombinedAuthGuard) and returns that actor's
 * today items.
 */
@Controller('digest')
export class DailyDigestController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get('today')
  @UseGuards(CombinedAuthGuard)
  async today(@Req() req: any) {
    const isProfessional = !!req?.user?.isProfessional;
    const actorId = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub;
    if (!actorId) throw new UnauthorizedException('Authentication required');

    return this.reminderService.getTodayItems({
      role: isProfessional ? 'professional' : 'client',
      id: actorId,
    });
  }
}
