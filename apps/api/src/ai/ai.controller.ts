import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('sandbox/requirements')
  async previewRequirements(@Body() body: { prompt?: string }) {
    return this.aiService.previewRequirements(body?.prompt ?? '');
  }
}
