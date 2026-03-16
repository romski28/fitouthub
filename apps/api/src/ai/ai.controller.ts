import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { AiService } from './ai.service';

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
    @Body() body: { sessionId?: string },
    @Request() req: any,
  ) {
    const userId: string | undefined = req?.user?.userId ?? req?.user?.sub ?? undefined;
    return this.aiService.convertIntake(id, {
      userId,
      sessionId: body?.sessionId,
    });
  }
}
