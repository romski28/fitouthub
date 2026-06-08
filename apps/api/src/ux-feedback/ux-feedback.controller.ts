import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { OptionalCombinedAuthGuard } from '../auth/optional-combined-auth.guard';
import { UxFeedbackService } from './ux-feedback.service';

@Controller('ux-feedback')
export class UxFeedbackController {
  constructor(private readonly service: UxFeedbackService) {}

  @Post()
  @UseGuards(OptionalCombinedAuthGuard)
  async submit(
    @Body() body: { projectId: string; answers: Record<string, unknown> },
    @Req() req: any,
  ) {
    const userId: string | undefined =
      req?.user?.id ?? req?.user?.userId ?? req?.user?.sub ?? undefined;
    return this.service.submit({
      projectId: body.projectId,
      userId,
      answers: body.answers,
    });
  }
}
