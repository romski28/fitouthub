import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('summary')
  @UseGuards(CombinedAuthGuard)
  async getUpdatesSummary(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const role = req.user?.isProfessional ? 'professional' : req.user.role || 'client';

    return this.updatesService.getUpdatesSummary(userId, role);
  }

  @Post('messages/mark-read')
  @UseGuards(CombinedAuthGuard)
  async markMessageGroupAsRead(
    @Req() req: any,
    @Body()
    body: {
      chatType: 'project-professional' | 'project-general' | 'assist' | 'private-foh';
      threadId: string;
    },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const role = req.user?.isProfessional ? 'professional' : req.user.role || 'client';

    return this.updatesService.markMessageGroupAsRead(userId, role, body);
  }
}
