import { Body, Controller, Get, Post, Req, UseGuards, Query, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('admin-ops-summary')
  @UseGuards(CombinedAuthGuard)
  async getAdminOpsSummary(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can access operations summary');
    }

    return this.updatesService.getAdminOpsSummary(userId);
  }

  @Get('admin-comms-feed')
  @UseGuards(CombinedAuthGuard)
  async getAdminCommsFeed(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('scope') scope?: 'all' | 'my' | 'unassigned',
    @Query('includeInfo') includeInfo?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can access communications feed');
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    const shouldIncludeInfo = includeInfo === '1' || includeInfo === 'true';
    return this.updatesService.getAdminCommsFeed(
      parsedLimit,
      userId,
      scope || 'all',
      shouldIncludeInfo,
    );
  }

  @Get('admin-comms-assignees')
  @UseGuards(CombinedAuthGuard)
  async getAdminCommsAssignees(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can access assignee list');
    }

    return this.updatesService.listAdminAssignees();
  }

  @Get('admin-conversations')
  @UseGuards(CombinedAuthGuard)
  async getAdminConversationIndex(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can access conversation index');
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    return this.updatesService.getAdminConversationIndex({
      limit: parsedLimit,
      clientId: clientId || undefined,
      status: status || undefined,
      channel: channel || undefined,
    });
  }

  @Post('admin-comms-feed/claim')
  @UseGuards(CombinedAuthGuard)
  async claimAdminCommsFeedItem(
    @Req() req: any,
    @Body() body: { sourceType: string; sourceId: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can claim messages');
    }
    if (!body?.sourceType || !body?.sourceId) {
      throw new BadRequestException('sourceType and sourceId are required');
    }

    return this.updatesService.claimAdminCommsItem(userId, body.sourceType, body.sourceId);
  }

  @Post('admin-comms-feed/assign')
  @UseGuards(CombinedAuthGuard)
  async assignAdminCommsFeedItem(
    @Req() req: any,
    @Body() body: { sourceType: string; sourceId: string; assignedToAdminId: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can assign messages');
    }
    if (!body?.sourceType || !body?.sourceId || !body?.assignedToAdminId) {
      throw new BadRequestException('sourceType, sourceId, and assignedToAdminId are required');
    }

    return this.updatesService.assignAdminCommsItem(
      userId,
      body.sourceType,
      body.sourceId,
      body.assignedToAdminId,
    );
  }

  @Post('admin-comms-feed/release')
  @UseGuards(CombinedAuthGuard)
  async releaseAdminCommsFeedItem(
    @Req() req: any,
    @Body() body: { sourceType: string; sourceId: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;

    if (!userId) {
      throw new BadRequestException('Missing user id in token');
    }
    if (tokenRole !== 'admin') {
      throw new ForbiddenException('Only admins can release messages');
    }
    if (!body?.sourceType || !body?.sourceId) {
      throw new BadRequestException('sourceType and sourceId are required');
    }

    return this.updatesService.releaseAdminCommsItem(userId, body.sourceType, body.sourceId);
  }

  @Get('summary')
  @UseGuards(CombinedAuthGuard)
  async getUpdatesSummary(@Req() req: any, @Query('actAs') actAs?: string, @Query('clientId') clientId?: string) {
    try {
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

      // Admin impersonation of client
      if (role === 'admin' && actAs === 'client' && clientId) {
        return this.updatesService.getUpdatesSummary(clientId, 'client');
      }

      return this.updatesService.getUpdatesSummary(userId, role);
    } catch (error) {
      console.error('[getUpdatesSummary] Controller error:', error?.message);
      throw error;
    }
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
