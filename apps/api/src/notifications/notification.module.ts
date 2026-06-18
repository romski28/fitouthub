import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationController } from './push-notification.controller';
import { TwilioProvider } from './twilio.provider';
import { NotificationWebhookController } from './notification-webhook.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { PrismaService } from '../prisma.service';
import { SupportRequestsModule } from '../support-requests/support-requests.module';

@Module({
  imports: [ConfigModule, SupportRequestsModule],
  controllers: [NotificationWebhookController, NotificationPreferencesController, PushNotificationController],
  providers: [NotificationService, PushNotificationService, TwilioProvider, PrismaService],
  exports: [NotificationService, PushNotificationService],
})
export class NotificationModule {}
