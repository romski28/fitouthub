import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { ProgressReportsService } from './progress-reports.service';
import { CreateProgressReportDto } from './progress-reports.dto';

@Controller('progress-reports')
export class ProgressReportsController {
  constructor(private readonly service: ProgressReportsService) {}

  /**
   * POST /progress-reports
   * Professional (or client) submits a progress report.
   */
  @Post()
  @UseGuards(CombinedAuthGuard)
  async create(@Req() req: any, @Body() body: CreateProgressReportDto) {
    const submittedById: string = req.user?.id || req.user?.sub;
    const tokenRole: string = req.user?.role || 'professional';

    if (!submittedById) throw new BadRequestException('Missing user id in token');

    const role = tokenRole === 'client' ? 'client' : 'professional';
    return this.service.createReport(submittedById, role, body);
  }

  /**
   * GET /progress-reports/project/:projectId
   * Returns all progress reports for a project (both parties can view).
   */
  @Get('project/:projectId')
  @UseGuards(CombinedAuthGuard)
  async getByProject(@Param('projectId') projectId: string, @Req() req: any) {
    const requesterId: string = req.user?.id || req.user?.sub;
    const requesterRole: string = req.user?.role || 'professional';
    if (!requesterId) throw new BadRequestException('Missing user id in token');
    return this.service.getReportsByProject(projectId, requesterId, requesterRole);
  }
}
