import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UxFeedbackService {
  constructor(private prisma: PrismaService) {}

  async submit(input: {
    projectId: string;
    userId?: string;
    answers: Record<string, unknown>;
  }) {
    return (this.prisma as any).uxFeedback.create({
      data: {
        projectId: input.projectId,
        userId: input.userId ?? null,
        answers: input.answers,
      },
    });
  }
}
