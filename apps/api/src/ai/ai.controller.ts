import { Body, Controller, Get, Param, Post, Put, Delete, Request, Query, ForbiddenException, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { OptionalCombinedAuthGuard } from './optional-combined-auth.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private resolveActor(req: any): { actorId: string; role: 'client' | 'professional' | 'admin' } {
    const actorId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    if (!actorId) {
      throw new ForbiddenException('Authentication required');
    }

    const tokenRole: string | undefined = req?.user?.role;
    const isProfessional = !!req?.user?.isProfessional;
    if (tokenRole === 'admin') {
      return { actorId, role: 'admin' };
    }
    if (tokenRole === 'professional' || isProfessional) {
      return { actorId, role: 'professional' };
    }

    return { actorId, role: 'client' };
  }

  @Get('sandbox/health')
  async getSandboxHealth() {
    return this.aiService.getSandboxHealth();
  }

  @Post('sandbox/vision/check')
  @UseGuards(CombinedAuthGuard)
  async checkVisionAccess(
    @Body() body: { model?: string; imageUrl?: string; provider?: 'deepseek' | 'qwen' },
    @Request() req: any,
  ) {
    const role: string | undefined = req?.user?.role;
    if (role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.aiService.testVisionAccess({
      model: body?.model,
      imageUrl: body?.imageUrl,
      provider: body?.provider,
    });
  }

  @Post('sandbox/requirements')
  @UseGuards(OptionalCombinedAuthGuard)
  async previewRequirements(@Body() body: { prompt?: string; sessionId?: string; intakeId?: string; mode?: 'structured' | 'conversational'; imageUrls?: string[] }, @Request() req: any) {
    const userId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    const userRole: string | undefined = req?.user?.role;
    const ipAddress = ((req?.headers?.['x-forwarded-for'] as string) || req?.ip || '')
      .split(',')[0]
      .trim();
    return this.aiService.previewRequirements(body?.prompt ?? '', {
      sessionId: body?.sessionId,
      intakeId: body?.intakeId,
      imageUrls: Array.isArray(body?.imageUrls) ? body.imageUrls : [],
      userId,
      userRole,
      ipAddress,
      mode: body?.mode ?? 'structured',
    });
  }

  @Post('sandbox/requirements/conversational')
  @UseGuards(OptionalCombinedAuthGuard)
  async previewConversationalRequirements(@Body() body: { prompt?: string; sessionId?: string; intakeId?: string; imageUrls?: string[] }, @Request() req: any) {
    const userId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    const userRole: string | undefined = req?.user?.role;
    const ipAddress = ((req?.headers?.['x-forwarded-for'] as string) || req?.ip || '')
      .split(',')[0]
      .trim();
    return this.aiService.previewConversationalRequirements(body?.prompt ?? '', {
      sessionId: body?.sessionId,
      intakeId: body?.intakeId,
      imageUrls: Array.isArray(body?.imageUrls) ? body.imageUrls : [],
      userId,
      userRole,
      ipAddress,
    });
  }

  @Get('sandbox/vision/quota')
  @UseGuards(OptionalCombinedAuthGuard)
  async getVisionQuota(@Query('sessionId') sessionId: string | undefined, @Request() req: any) {
    const userId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    const userRole: string | undefined = req?.user?.role;
    return this.aiService.getVisionQuota({
      userId,
      userRole,
      sessionId,
    });
  }

  @Get('admin/metrics')
  @UseGuards(CombinedAuthGuard)
  async getAiAdminMetrics(@Request() req: any) {
    const role: string | undefined = req?.user?.role;
    if (role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.aiService.getAiAdminMetrics();
  }

  @Post('intake/:id/convert')
  async convertIntake(
    @Param('id') id: string,
    @Body()
    body: {
      sessionId?: string;
      followUpAnswers?: Array<{ question?: string; answer?: string }>;
      finalSummary?: string;
    },
    @Request() req: any,
  ) {
    const userId: string | undefined = req?.user?.userId ?? req?.user?.sub ?? undefined;
    return this.aiService.convertIntake(id, {
      userId,
      sessionId: body?.sessionId,
      followUpAnswers: body?.followUpAnswers,
      finalSummary: body?.finalSummary,
    });
  }

  @Post('intake/:id/trade-feedback')
  async saveTradeFeedback(
    @Param('id') id: string,
    @Body()
    body: {
      sessionId?: string;
      selectedTrades?: string[];
      removedTrades?: string[];
    },
    @Request() req: any,
  ) {
    const userId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    return this.aiService.saveTradeFeedback(id, {
      userId,
      sessionId: body?.sessionId,
      selectedTrades: body?.selectedTrades,
      removedTrades: body?.removedTrades,
    });
  }

  @Get('professionals/count')
  async countProfessionals(
    @Query('trades') tradesParam?: string,
    @Query('location') location?: string,
  ) {
    // Parse trades from comma-separated string to array
    const trades = tradesParam ? tradesParam.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
    return this.aiService.countProfessionals(trades, location);
  }

  @Post('intake/:id/safety-ack')
  @UseGuards(CombinedAuthGuard)
  async acknowledgeSafety(@Param('id') id: string, @Request() req: any) {
    const userId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    const role: string | undefined = req?.user?.role;
    if (!userId || role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return this.aiService.acknowledgeSafetyTriage(id, {
      adminUserId: userId,
      adminName: req?.user?.email ?? req?.user?.nickname ?? 'Admin',
    });
  }

  @Get('projects/:projectId/scope')
  @UseGuards(CombinedAuthGuard)
  async getProjectScope(@Param('projectId') projectId: string, @Request() req: any) {
    const actor = this.resolveActor(req);
    return this.aiService.getProjectScope(projectId, actor);
  }

  @Post('projects/:projectId/scope/generate')
  @UseGuards(CombinedAuthGuard)
  async generateProjectScope(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      additionalContext?: string;
      siteConstraints?: string;
      longLeadItems?: string;
      workingCalendar?: string;
      deadline?: string;
    },
    @Request() req: any,
  ) {
    const actor = this.resolveActor(req);
    return this.aiService.generateProjectScope(projectId, actor, body || {});
  }

  @Post('projects/:projectId/scope/entries')
  @UseGuards(CombinedAuthGuard)
  async createProjectScopeEntry(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      workPackage: string;
      deliverable?: string;
      primaryTrade: string;
      durationMinDays?: number;
      durationMaxDays?: number;
      dependencies?: string[];
      phase?: string;
      milestoneCode?: string | null;
      notes?: string;
    },
    @Request() req: any,
  ) {
    const actor = this.resolveActor(req);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.aiService.createProjectScopeEntry(projectId, actor, body || {});
  }

  @Put('projects/:projectId/scope/entries/:entryId')
  @UseGuards(CombinedAuthGuard)
  async updateProjectScopeEntry(
    @Param('projectId') projectId: string,
    @Param('entryId') entryId: string,
    @Body()
    body: {
      workPackage?: string;
      deliverable?: string;
      primaryTrade?: string;
      durationMinDays?: number;
      durationMaxDays?: number;
      dependencies?: string[];
      phase?: string;
      milestoneCode?: string | null;
      notes?: string;
    },
    @Request() req: any,
  ) {
    const actor = this.resolveActor(req);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.aiService.updateProjectScopeEntry(projectId, entryId, actor, body || {});
  }

  @Delete('projects/:projectId/scope/entries/:entryId')
  @UseGuards(CombinedAuthGuard)
  async deleteProjectScopeEntry(
    @Param('projectId') projectId: string,
    @Param('entryId') entryId: string,
    @Request() req: any,
  ) {
    const actor = this.resolveActor(req);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.aiService.deleteProjectScopeEntry(projectId, entryId, actor);
  }
}
