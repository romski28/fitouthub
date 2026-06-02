import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { PrismaService } from '../prisma.service';
import { NotificationModule } from '../notifications/notification.module';
import { EmailModule } from '../email/email.module';
import { ChatModule } from '../chat/chat.module';
import { ReminderController } from './reminder.controller';

@Module({
  imports: [NotificationModule, EmailModule, ChatModule],
  controllers: [ReminderController],
  providers: [ReminderService, PrismaService],
})
export class ReminderModule {}
