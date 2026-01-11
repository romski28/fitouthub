import { Body, Controller, Get, Post, Req, UseGuards, Query } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('summary')
  @UseGuards(CombinedAuthGuard)
  async getUpdatesSummary(@Req() req: any, @Query('actAs') actAs?: string, @Query('clientId') clientId?: string) {
    const userId = req.user?.id || req.user?.sub;
    const isProfessional = req.user?.isProfessional;
    const isAdmin = req.user?.role === 'admin';
    
    let role: 'client' | 'professional' | 'admin' = 'client';
    if (isProfessional) {
      role = 'professional';
    } else if (isAdmin) {
      role = 'admin';
    }

    console.log('[getUpdatesSummary] User:', userId, 'Role:', role, 'req.user.role:', req.user?.role, 'isProfessional:', isProfessional, 'isAdmin:', isAdmin, 'actAs:', actAs, 'clientId:', clientId);

    // If admin is impersonating client, route to client view for the specified clientId
    if (isAdmin && actAs === 'client' && clientId) {
      return this.updatesService.getUpdatesSummary(clientId, 'client');
    }

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
