import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { TwilioProvider } from './twilio.provider';
import { NotificationWebhookController } from './notification-webhook.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { PrismaService } from '../prisma.service';
import { SupportRequestsModule } from '../support-requests/support-requests.module';

@Module({
  imports: [ConfigModule, SupportRequestsModule],
  controllers: [NotificationWebhookController, NotificationPreferencesController],
  providers: [NotificationService, TwilioProvider, PrismaService],
  exports: [NotificationService],
})
export class NotificationModule {}
