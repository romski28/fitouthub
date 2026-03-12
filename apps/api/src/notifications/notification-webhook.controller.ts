import { Controller, Post, Body, Logger, HttpCode, ForbiddenException, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';
import { NotificationService } from './notification.service';
import { NotificationStatus } from './notification.types';
import { SupportRequestsService } from '../support-requests/support-requests.service';

@Controller('notifications/webhook')
export class NotificationWebhookController {
  private readonly logger = new Logger(NotificationWebhookController.name);

  constructor(
    private notificationService: NotificationService,
    private supportRequestsService: SupportRequestsService,
    private configService: ConfigService,
  ) {}

  private validateTwilioSignature(req: any): void {
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    if (!authToken) return;
    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature) {
      this.logger.warn(`Rejected webhook - missing X-Twilio-Signature from ${req.ip}`);
      throw new ForbiddenException('Invalid request origin');
    }
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers['host'];
    const url = `${protocol}://${host}${req.originalUrl}`;
    const valid = twilio.validateRequest(authToken, signature, url, req.body as Record<string, string>);
    if (!valid) {
      this.logger.warn(`Rejected webhook - invalid Twilio signature from ${req.ip}`);
      throw new ForbiddenException('Invalid request origin');
    }
  }

  /**
   * Twilio inbound WhatsApp + status callback webhook
   */
  @Post('twilio')
  @HttpCode(200)
  async handleTwilioWebhook(@Req() req: any, @Body() payload: any) {
    try {
      this.validateTwilioSignature(req);
      this.logger.log(`Twilio webhook received: ${JSON.stringify(payload)}`);

      const isInboundWhatsapp =
        typeof payload?.From === 'string' &&
        payload.From.toLowerCase().startsWith('whatsapp:') &&
        typeof payload?.Body === 'string';

      if (isInboundWhatsapp) {
        await this.supportRequestsService.createFromWhatsapp(payload);
        this.logger.log('Inbound WhatsApp persisted to support request pool');
        return { success: true, type: 'inbound_whatsapp' };
      }

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
