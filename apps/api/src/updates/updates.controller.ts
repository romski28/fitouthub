import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('summary')
  @UseGuards(CombinedAuthGuard)
  async getUpdatesSummary(@Req() req: any) {
    const userId = req.user.id;
    const role = req.user.role || 'client';

    return this.updatesService.getUpdatesSummary(userId, role);
  }
}
