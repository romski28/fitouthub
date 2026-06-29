import { Module } from '@nestjs/common';
import { ProgressReportsController } from './progress-reports.controller';
import { ProgressReportsService } from './progress-reports.service';
import { PrismaService } from '../prisma.service';
import { ChatModule } from '../chat/chat.module';
import { FinancialModule } from '../financial/financial.module';
import { ProjectStageService } from '../projects/project-stage.service';
import { NextStepService } from '../projects/next-step.service';
import { ActivityLogService } from '../activity-log.service';
import { AdminActionService } from '../projects/admin-action.service';

@Module({
  imports: [ChatModule, FinancialModule],
  controllers: [ProgressReportsController],
  providers: [ProgressReportsService, PrismaService, ProjectStageService, NextStepService, ActivityLogService, AdminActionService],
  exports: [ProgressReportsService],
})
export class ProgressReportsModule {}
