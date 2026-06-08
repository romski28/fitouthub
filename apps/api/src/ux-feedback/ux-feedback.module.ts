import { Module } from '@nestjs/common';
import { UxFeedbackController } from './ux-feedback.controller';
import { UxFeedbackService } from './ux-feedback.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [UxFeedbackController],
  providers: [UxFeedbackService, PrismaService],
})
export class UxFeedbackModule {}
