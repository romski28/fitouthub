import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { DailyDigestController } from './daily-digest.controller';
import { PrismaService } from '../prisma.service';
import { NotificationModule } from '../notifications/notification.module';
import { EmailModule } from '../email/email.module';
import { ChatModule } from '../chat/chat.module';
import { ReminderController } from './reminder.controller';

@Module({
  imports: [NotificationModule, EmailModule, ChatModule],
  controllers: [ReminderController, DailyDigestController],
  providers: [ReminderService, PrismaService],
})
export class ReminderModule {}
