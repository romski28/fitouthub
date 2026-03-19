import { Body, Controller, Get, Param, Post, Request, Query, ForbiddenException, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('sandbox/health')
  async getSandboxHealth() {
    return this.aiService.getSandboxHealth();
  }

  @Post('sandbox/requirements')
  async previewRequirements(@Body() body: { prompt?: string; sessionId?: string }, @Request() req: any) {
    const userId: string | undefined = req?.user?.userId ?? req?.user?.sub ?? undefined;
    return this.aiService.previewRequirements(body?.prompt ?? '', {
      sessionId: body?.sessionId,
      userId,
    });
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
}
