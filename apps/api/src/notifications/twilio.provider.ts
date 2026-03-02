import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';
import {
  INotificationProvider,
  NotificationResponse,
  NotificationStatus,
} from './notification.types';

@Injectable()
export class TwilioProvider implements INotificationProvider {
  private readonly logger = new Logger(TwilioProvider.name);
  private client: Twilio.Twilio;
  private readonly fromPhoneNumber: string | undefined;
  private readonly whatsappNumber: string | undefined;
  readonly name = 'Twilio';

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromPhoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');
    this.whatsappNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio credentials not configured. Notifications will be logged only.');
      return;
    }

    this.client = Twilio(accountSid, authToken);
    this.logger.log('Twilio provider initialized');
  }

  async sendSMS(phoneNumber: string, message: string): Promise<NotificationResponse> {
    try {
      if (!this.client) {
        this.logger.warn(`[DEV MODE] SMS to ${phoneNumber}: ${message}`);
        return {
          success: true,
          providerId: 'dev-mode-' + Date.now(),
          status: 'sent',
        };
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.fromPhoneNumber,
        to: phoneNumber,
        statusCallback: `${this.configService.get('API_BASE_URL')}/api/notifications/webhook/twilio`,
      });

      this.logger.log(`SMS sent to ${phoneNumber}: ${result.sid}`);

      return {
        success: true,
        providerId: result.sid,
        status: this.mapTwilioStatus(result.status),
        response: result,
      };
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phoneNumber}:`, error);
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async sendWhatsApp(phoneNumber: string, message: string): Promise<NotificationResponse> {
    try {
      if (!this.client) {
        this.logger.warn(`[DEV MODE] WhatsApp to ${phoneNumber}: ${message}`);
        return {
          success: true,
          providerId: 'dev-mode-' + Date.now(),
          status: 'sent',
        };
      }

      // Format phone number for WhatsApp (must include country code)
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const whatsappTo = `whatsapp:${formattedNumber}`;
      const whatsappFrom = `whatsapp:${this.whatsappNumber}`;

      const result = await this.client.messages.create({
        body: message,
        from: whatsappFrom,
        to: whatsappTo,
        statusCallback: `${this.configService.get('API_BASE_URL')}/api/notifications/webhook/twilio`,
      });

      this.logger.log(`WhatsApp sent to ${phoneNumber}: ${result.sid}`);

      return {
        success: true,
        providerId: result.sid,
        status: this.mapTwilioStatus(result.status),
        response: result,
      };
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp to ${phoneNumber}:`, error);
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Maps Twilio message status to our internal status enum
   * Twilio statuses: queued, sending, sent, delivered, undelivered, failed, read
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
