import {
  Controller,
  Post,
  Param,
  Body,
  Get,
  Query,
  Patch,
} from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('professionals/:id/report')
  async reportProfessional(
    @Param('id') professionalId: string,
    @Body() body: { reporterUserId?: string; comments: string },
  ) {
    const report = await this.reports.createProfessionalReport(
      professionalId,
      body.reporterUserId,
      body.comments,
    );
    return { success: true, report };
  }

  @Get('admin/reports/count')
  async outstandingCount() {
    return this.reports.getOutstandingCount();
  }

  @Get('admin/reports')
  async listReports(
    @Query('status') status?: 'new' | 'reviewed' | 'resolved',
    @Query('professionalId') professionalId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.reports.listReports({
      status,
      professionalId,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  @Patch('admin/reports/:id')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'new' | 'reviewed' | 'resolved' },
  ) {
    const updated = await this.reports.updateReportStatus(id, body.status);
    return { success: true, report: updated };
  }
}
