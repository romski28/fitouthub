import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectStage } from '@prisma/client';
import { NextStepService } from './next-step.service';

@Controller('admin/next-step-configs')
@UseGuards(AuthGuard('jwt'))
export class NextStepConfigController {
  constructor(private readonly nextStepService: NextStepService) {}

  private ensureAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can manage next-step modal content',
      );
    }
  }

  @Get()
  async listConfigs(
    @Request() req: any,
    @Query('role') role?: string,
    @Query('projectStage') projectStage?: string,
    @Query('actionKey') actionKey?: string,
  ) {
    this.ensureAdmin(req);

    try {
      const stageFilter =
        projectStage &&
        Object.values(ProjectStage).includes(projectStage as ProjectStage)
          ? (projectStage as ProjectStage)
          : undefined;

      const rows = await this.nextStepService.listNextStepConfigs({
        role,
        projectStage: stageFilter,
        actionKey,
      });

      return { rows };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id/modal-content')
  async updateModalContent(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      modalTitle?: string | null;
      modalBody?: string | null;
      modalDetailsBody?: string | null;
      modalSuccessTitle?: string | null;
      modalSuccessBody?: string | null;
      modalSuccessNextStepBody?: string | null;
      modalImageUrl?: string | null;
      modalPrimaryButtonLabel?: string | null;
      modalSecondaryButtonLabel?: string | null;
    },
  ) {
    this.ensureAdmin(req);

    try {
      const row = await this.nextStepService.updateNextStepConfigModalContent(
        id,
        body,
      );
      return { success: true, row };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
