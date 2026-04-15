import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { NextStepService } from './projects/next-step.service';
import { AdminActionService } from './projects/admin-action.service';
import { ProjectStageService } from './projects/project-stage.service';
import { ContractService } from './projects/contract.service';
import { ProfessionalsModule } from './professionals/professionals.module';
import { TradesmModule } from './tradesman/tradesman.module';
import { UploadsController } from './uploads/uploads.controller';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { UsersModule } from './users/users.module';
import { ProfessionalAuthModule } from './professional-auth/professional-auth.module';
import { ProfessionalModule } from './professional/professional.module';
import { ClientModule } from './client/client.module';
import { TradesModule } from './trades/trades.module';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { AssistRequestsController } from './assist/assist-requests.controller';
import { AssistRequestsService } from './assist/assist-requests.service';
import { ChatModule } from './chat/chat.module';
import { ChatService } from './chat/chat.service';
import { FinancialModule } from './financial/financial.module';
import { UpdatesModule } from './updates/updates.module';
import { MagicLinkController } from './auth/magic-link.controller';
import { JwtModule } from '@nestjs/jwt';
import { ActivityLogController } from './activity-log.controller';
import { MilestonesModule } from './milestones/milestones.module';
import { NotificationModule } from './notifications/notification.module';
import { PoliciesModule } from './policies/policies.module';
import { SupportRequestsModule } from './support-requests/support-requests.module';
import { AiModule } from './ai/ai.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { RealtimeModule } from './realtime/realtime.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { AcProjectsModule } from './ac-projects/ac-projects.module';

@Module({
  imports: [
    ProfessionalsModule,
    TradesmModule,
    AuthModule,
    EmailModule,
    UsersModule,
    ProfessionalAuthModule,
    ProfessionalModule,
    ClientModule,
    TradesModule,
    ChatModule,
    FinancialModule,
    UpdatesModule,
    MilestonesModule,
    NotificationModule,
    PoliciesModule,
    AnnouncementsModule,
    QuestionnairesModule,
    RealtimeModule,
    SupportRequestsModule,
    AiModule,
    AcProjectsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [
    AppController,
    ProjectsController,
    UploadsController,
    ReportsController,
    AssistRequestsController,
    MagicLinkController,
    ActivityLogController,
  ],
  providers: [
    AppService,
    PrismaService,
    ProjectsService,
    NextStepService,
    AdminActionService,
    ProjectStageService,
    ContractService,
    ReportsService,
    AssistRequestsService,
    ChatService,
  ],
  exports: [PrismaService],
})
export class AppModule {}
