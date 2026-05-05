import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { PrismaService } from '../prisma.service';
import { NotificationModule } from '../notifications/notification.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [NotificationModule, EmailModule],
  providers: [ReminderService, PrismaService],
})
export class ReminderModule {}
