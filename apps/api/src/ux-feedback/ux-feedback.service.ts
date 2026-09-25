import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UxFeedbackService {
  constructor(private prisma: PrismaService) {}

  async submit(input: {
    projectId: string;
    userId?: string;
    respondentType?: 'client' | 'professional';
    respondentId?: string;
    answers: Record<string, unknown>;
    surveyVersion?: string;
  }) {
    return (this.prisma as any).uxFeedback.create({
      data: {
        projectId: input.projectId,
        userId: input.userId ?? null,
        respondentType: input.respondentType ?? null,
        respondentId: input.respondentId ?? null,
        surveyVersion: input.surveyVersion ?? null,
        answers: input.answers,
      },
    });
  }

  /** Whether a respondent already answered the platform section this quarter. */
  async hasPlatformFeedbackThisQuarter(respondentType: string, respondentId: string): Promise<boolean> {
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const rows = await (this.prisma as any).uxFeedback.findMany({
      where: {
        respondentType,
        respondentId,
        submittedAt: { gte: quarterStart },
      },
      select: { answers: true },
    });
    return rows.some((r: any) => Boolean(r?.answers?.platformRated));
  }

  async listByProject(projectId: string) {
    return (this.prisma as any).uxFeedback.findMany({
      where: { projectId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async listAll(params: {
    surveyVersion?: string;
    respondentType?: string;
    limit?: number;
    offset?: number;
  }) {
    const { surveyVersion, respondentType, limit = 50, offset = 0 } = params || {};
    const where: any = {};
    if (surveyVersion) where.surveyVersion = surveyVersion;
    if (respondentType) where.respondentType = respondentType;

    const [items, total] = await Promise.all([
      (this.prisma as any).uxFeedback.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
        skip: Math.max(offset, 0),
      }),
      (this.prisma as any).uxFeedback.count({ where }),
    ]);

    return { items, total };
  }
}
