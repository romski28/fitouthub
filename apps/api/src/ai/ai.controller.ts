import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('sandbox/health')
  async getSandboxHealth() {
    return this.aiService.getSandboxHealth();
  }

  @Post('sandbox/requirements')
  async previewRequirements(@Body() body: { prompt?: string }) {
    return this.aiService.previewRequirements(body?.prompt ?? '');
  }
}
