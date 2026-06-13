import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UxFeedbackService {
  constructor(private prisma: PrismaService) {}

  async submit(input: {
    projectId: string;
    userId?: string;
    answers: Record<string, unknown>;
    surveyVersion?: string;
  }) {
    return (this.prisma as any).uxFeedback.create({
      data: {
        projectId: input.projectId,
        userId: input.userId ?? null,
        surveyVersion: input.surveyVersion ?? null,
        answers: input.answers,
      },
    });
  }

  async listAll(params: {
    surveyVersion?: string;
    limit?: number;
    offset?: number;
  }) {
    const { surveyVersion, limit = 50, offset = 0 } = params || {};
    const where: any = {};
    if (surveyVersion) where.surveyVersion = surveyVersion;

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
