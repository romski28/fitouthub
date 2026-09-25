import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UxFeedbackService } from './ux-feedback.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('ux-feedback')
export class UxFeedbackController {
  constructor(private readonly service: UxFeedbackService) {}

  @Post()
  @UseGuards(CombinedAuthGuard)
  async submit(
    @Body() body: { projectId: string; answers: Record<string, unknown>; surveyVersion?: string; surveyType?: string },
    @Req() req: any,
  ) {
    const isProfessional = Boolean(req?.user?.isProfessional);
    const respondentId: string | undefined = req?.user?.id ?? req?.user?.sub ?? undefined;

    return this.service.submit({
      projectId: body.projectId,
      userId: isProfessional ? undefined : respondentId,
      respondentType: isProfessional ? 'professional' : 'client',
      respondentId,
      answers: body.answers,
      surveyVersion: body.surveyVersion,
      surveyType: body.surveyType,
    });
  }

  /** Whether this respondent should see the platform section this quarter. */
  @Get('platform-due')
  @UseGuards(CombinedAuthGuard)
  async platformDue(@Req() req: any) {
    const isProfessional = Boolean(req?.user?.isProfessional);
    const respondentId = req?.user?.id ?? req?.user?.sub ?? '';
    const due = !(await this.service.hasPlatformFeedbackThisQuarter(
      isProfessional ? 'professional' : 'client',
      respondentId,
    ));
    return { due };
  }

  @Get('project/:projectId')
  async listByProject(@Param('projectId') projectId: string) {
    return this.service.listByProject(projectId);
  }

  @Get('admin')
  async listAll(
    @Query('surveyType') surveyType?: string,
    @Query('respondentType') respondentType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.service.listAll({
      surveyType,
      respondentType,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }
}

