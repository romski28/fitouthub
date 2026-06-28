import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationModule } from '../notifications/notification.module';
import { StripePaymentsService } from './stripe-payments.service';
import { ProjectStageService } from '../projects/project-stage.service';
import { NextStepService } from '../projects/next-step.service';
import { ActivityLogService } from '../activity-log.service';
import { AdminActionService } from '../projects/admin-action.service';

@Module({
  imports: [EmailModule, ChatModule, NotificationModule],
  controllers: [FinancialController],
  providers: [
    FinancialService,
    PrismaService,
    StripePaymentsService,
    ProjectStageService,
    NextStepService,
    ActivityLogService,
    AdminActionService,
  ],
  exports: [FinancialService],
})
export class FinancialModule {}
