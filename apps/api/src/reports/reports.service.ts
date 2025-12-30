import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async createProfessionalReport(
    professionalId: string,
    reporterUserId: string | undefined,
    comments: string,
  ) {
    if (!professionalId) throw new Error('professionalId is required');
    if (!comments || comments.trim().length === 0)
      throw new Error('comments are required');

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

  async listReports(params: {
    status?: 'new' | 'reviewed' | 'resolved';
    professionalId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, professionalId, limit = 50, offset = 0 } = params || {};
    const where: any = {};
    if (status) where.status = status;
    if (professionalId) where.professionalId = professionalId;

    const [items, total] = await Promise.all([
      (this.prisma as any).professionalReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
        skip: Math.max(offset, 0),
        include: {
          professional: {
            select: {
              id: true,
              fullName: true,
              email: true,
              businessName: true,
              professionType: true,
              primaryTrade: true,
            },
          },
        },
      }),
      (this.prisma as any).professionalReport.count({ where }),
    ]);

    return { items, total };
  }

  async updateReportStatus(
    id: string,
    status: 'new' | 'reviewed' | 'resolved',
  ) {
    if (!id) throw new Error('id is required');
    if (!['new', 'reviewed', 'resolved'].includes(status))
      throw new Error('invalid status');
    const updated = await (this.prisma as any).professionalReport.update({
      where: { id },
      data: { status },
    });
    return updated;
  }
}
