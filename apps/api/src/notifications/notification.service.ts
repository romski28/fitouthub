import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TwilioProvider } from './twilio.provider';
import {
  SendNotificationDto,
  NotificationChannel,
  NotificationStatus,
  NotificationResponse,
} from './notification.types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private twilioProvider: TwilioProvider,
  ) {}

  /**
   * Send a notification to a user based on their preferences
   */
  async send(dto: SendNotificationDto): Promise<void> {
    try {
      // Get user preferences (or skip if table doesn't exist)
      let preferences = null;
      let channel = NotificationChannel.WHATSAPP; // default channel
      
      try {
        preferences = await this.prisma.notificationPreference.findUnique({
          where: { userId: dto.userId },
        });
        channel = dto.channel || preferences?.primaryChannel || NotificationChannel.WHATSAPP;
        
        // Check if channel is enabled
        if (preferences) {
          const channelEnabled = this.isChannelEnabled(channel, preferences);
          if (!channelEnabled) {
            this.logger.warn(`Channel ${channel} is disabled for user ${dto.userId}`);
            return;
          }
        }
      } catch (prefError) {
        // Notification preference table might not exist yet - use default channel
        this.logger.debug(`Could not load preferences (table may not exist):`, (prefError as any)?.code);
        channel = dto.channel || NotificationChannel.WHATSAPP;
      }

      // Send notification
      let response: NotificationResponse;
      
      if (channel === NotificationChannel.WHATSAPP) {
        response = await this.twilioProvider.sendWhatsApp(dto.phoneNumber, dto.message);
        
        // If WhatsApp fails and SMS is enabled, fallback to SMS
        if (!response.success && preferences?.enableSMS) {
          this.logger.log(`WhatsApp failed for ${dto.userId}, falling back to SMS`);
          response = await this.twilioProvider.sendSMS(dto.phoneNumber, dto.message);
        }
      } else if (channel === NotificationChannel.SMS) {
        response = await this.twilioProvider.sendSMS(dto.phoneNumber, dto.message);
      } else {
        this.logger.warn(`Unsupported channel: ${channel}`);
        return;
      }

      // Log to database (best effort - don't fail if table doesn't exist)
      try {
        await this.logNotification({
          userId: dto.userId,
          channel,
          phoneNumber: dto.phoneNumber,
          eventType: dto.eventType,
          message: dto.message,
          status: response.status,
          providerId: response.providerId,
          providerResponse: response.response,
          failureReason: response.error,
        });
      } catch (logError) {
        // Notification log table might not exist yet - just log warning
        this.logger.debug(`Could not save notification log (table may not exist):`, (logError as any)?.code);
        // Notification was still sent via Twilio, so don't fail here
      }

    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
      
      // Try to log failure to database (best effort)
      try {
        await this.logNotification({
          userId: dto.userId,
          channel: dto.channel || NotificationChannel.WHATSAPP,
          phoneNumber: dto.phoneNumber,
          eventType: dto.eventType,
          message: dto.message,
          status: 'failed',
          failureReason: error.message,
        });
      } catch (logError) {
        this.logger.debug(`Could not save failure log:`, (logError as any)?.code);
      }
    }
  }

  /**
   * Update notification status from webhook callbacks
   */
  async updateStatus(
    providerId: string,
    status: NotificationStatus,
    metadata?: { deliveredAt?: Date; readAt?: Date },
  ): Promise<void> {
    try {
      const log = await this.prisma.notificationLog.findFirst({
        where: { providerId },
      });

      if (!log) {
        this.logger.warn(`Notification log not found for providerId: ${providerId}`);
        return;
      }

      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status,
          deliveredAt: metadata?.deliveredAt,
          readAt: metadata?.readAt,
        },
      });

      this.logger.log(`Updated notification ${providerId} status to ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update notification status:`, error);
    }
  }

  /**
   * Get or create default notification preferences for a user
   */
  async getOrCreatePreferences(userId: string) {
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: {
          userId,
          primaryChannel: NotificationChannel.WHATSAPP,
          fallbackChannel: NotificationChannel.SMS,
          enableSMS: true,
          enableWhatsApp: true,
          enableWeChat: false,
          enableEmail: true,
        },
      });
    }

    return preferences;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, preferences: Partial<{
    primaryChannel: NotificationChannel;
    fallbackChannel: NotificationChannel;
    enableSMS: boolean;
    enableWhatsApp: boolean;
    enableWeChat: boolean;
    enableEmail: boolean;
    weChatOpenId: string;
  }>) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: preferences,
      create: {
        userId,
        ...preferences,
      },
    });
  }

  /**
   * Get notification history for a user
   */
  async getHistory(userId: string, limit = 50) {
    return this.prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Helper: Check if a channel is enabled for user
   */
  private isChannelEnabled(
    channel: NotificationChannel,
    preferences: any,
  ): boolean {
    const channelMap = {
      [NotificationChannel.SMS]: preferences.enableSMS,
      [NotificationChannel.WHATSAPP]: preferences.enableWhatsApp,
      [NotificationChannel.WECHAT]: preferences.enableWeChat,
      [NotificationChannel.EMAIL]: preferences.enableEmail,
    };

    return channelMap[channel] ?? true;
  }

  /**
   * Helper: Log notification to database
   */
  private async logNotification(data: {
    userId: string;
    channel: NotificationChannel;
    phoneNumber: string;
    eventType: string;
    message: string;
    status: NotificationStatus;
    providerId?: string;
    providerResponse?: any;
    failureReason?: string;
  }) {
    return this.prisma.notificationLog.create({
      data: {
        userId: data.userId,
        channel: data.channel,
        phoneNumber: data.phoneNumber,
        eventType: data.eventType,
        message: data.message,
        status: data.status,
        providerId: data.providerId,
        providerResponse: data.providerResponse,
        failureReason: data.failureReason,
      },
    });
  }
}
