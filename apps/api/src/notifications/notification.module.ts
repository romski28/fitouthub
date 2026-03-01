import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { TwilioProvider } from './twilio.provider';
import { NotificationWebhookController } from './notification-webhook.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationWebhookController],
  providers: [NotificationService, TwilioProvider, PrismaService],
  exports: [NotificationService],
})
export class NotificationModule {}
