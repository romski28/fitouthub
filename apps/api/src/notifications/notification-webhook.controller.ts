import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationStatus } from './notification.types';

@Controller('notifications/webhook')
export class NotificationWebhookController {
  private readonly logger = new Logger(NotificationWebhookController.name);

  constructor(private notificationService: NotificationService) {}

  /**
   * Twilio status callback webhook
   * Called when message status changes (sent, delivered, read, failed, etc.)
   */
  @Post('twilio')
  @HttpCode(200)
  async handleTwilioWebhook(@Body() payload: any) {
    try {
      this.logger.log(`Twilio webhook received: ${JSON.stringify(payload)}`);

      const messageSid = payload.MessageSid || payload.SmsSid;
      const messageStatus = payload.MessageStatus || payload.SmsStatus;

      if (!messageSid || !messageStatus) {
        this.logger.warn('Invalid webhook payload - missing SID or status');
        return { success: false };
      }

      // Map Twilio status to our internal status
      const status = this.mapTwilioStatus(messageStatus);

      // Determine if delivered or read
      const metadata: { deliveredAt?: Date; readAt?: Date } = {};
      if (status === 'delivered') {
        metadata.deliveredAt = new Date();
      } else if (status === 'read') {
        metadata.readAt = new Date();
        metadata.deliveredAt = new Date(); // If read, it was also delivered
      }

      await this.notificationService.updateStatus(messageSid, status, metadata);

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process Twilio webhook:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Maps Twilio message status to our internal status enum
   */
  private mapTwilioStatus(twilioStatus: string): NotificationStatus {
    const statusMap: Record<string, NotificationStatus> = {
      queued: 'pending',
      sending: 'pending',
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      undelivered: 'undeliverable',
      failed: 'failed',
    };

    return statusMap[twilioStatus.toLowerCase()] || 'pending';
  }
}
