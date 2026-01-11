import { Body, Controller, Get, Post, Req, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('summary')
  @UseGuards(CombinedAuthGuard)
  async getUpdatesSummary(@Req() req: any, @Query('actAs') actAs?: string, @Query('clientId') clientId?: string) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;
    const isProfessionalFlag = req.user?.isProfessional;

    // Derive a single role from token; no fallbacks that blend roles
    let role: 'client' | 'professional' | 'admin' = 'client';
    if (tokenRole === 'admin') {
      role = 'admin';
    } else if (tokenRole === 'professional' || isProfessionalFlag) {
      role = 'professional';
    } else {
      role = 'client';
    }

    // Warn if token claims conflicting flags
    if (tokenRole === 'admin' && isProfessionalFlag) {
      console.warn('[getUpdatesSummary] Conflicting token flags: admin + isProfessional=true for user', userId);
    }

    // actAs is only allowed for admin
    if (actAs && actAs !== 'client') {
      throw new BadRequestException('Unsupported actAs value');
    }
    if (actAs && !clientId) {
      throw new BadRequestException('clientId is required when actAs is provided');
    }
    if (actAs && role !== 'admin') {
      throw new BadRequestException('actAs is only permitted for admin');
    }

    console.log('[getUpdatesSummary] User:', userId, 'Role:', role, 'tokenRole:', tokenRole, 'isProfessionalFlag:', isProfessionalFlag, 'actAs:', actAs, 'clientId:', clientId);

    // Admin impersonation of client
    if (role === 'admin' && actAs === 'client' && clientId) {
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
