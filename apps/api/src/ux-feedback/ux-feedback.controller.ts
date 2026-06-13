import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { UxFeedbackService } from './ux-feedback.service';

@Controller('ux-feedback')
export class UxFeedbackController {
  constructor(private readonly service: UxFeedbackService) {}

  @Post()
  async submit(
    @Body() body: { projectId: string; answers: Record<string, unknown>; surveyVersion?: string },
    @Req() req: any,
  ) {
    const userId: string | undefined =
      req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    return this.service.submit({
      projectId: body.projectId,
      userId,
      answers: body.answers,
      surveyVersion: body.surveyVersion,
    });
  }

  @Get('admin')
  async listAll(
    @Query('surveyVersion') surveyVersion?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.service.listAll({
      surveyVersion,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }
}
