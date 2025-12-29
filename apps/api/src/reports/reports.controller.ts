import { Controller, Post, Param, Body, Get } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('professionals/:id/report')
  async reportProfessional(
    @Param('id') professionalId: string,
    @Body() body: { reporterUserId?: string; comments: string },
  ) {
    const report = await this.reports.createProfessionalReport(professionalId, body.reporterUserId, body.comments);
    return { success: true, report };
  }

  @Get('admin/reports/count')
  async outstandingCount() {
    return this.reports.getOutstandingCount();
  }
}
