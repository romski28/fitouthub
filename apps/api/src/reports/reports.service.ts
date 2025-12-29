import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async createProfessionalReport(professionalId: string, reporterUserId: string | undefined, comments: string) {
    if (!professionalId) throw new Error('professionalId is required');
    if (!comments || comments.trim().length === 0) throw new Error('comments are required');

    const report = await (this.prisma as any).professionalReport.create({
      data: {
        professionalId,
        reporterUserId,
        comments: comments.trim(),
        status: 'new',
      },
    });
    return report;
  }

  async getOutstandingCount() {
    const count = await (this.prisma as any).professionalReport.count({
      where: { status: 'new' },
    });
    return { outstanding: count };
  }
}
