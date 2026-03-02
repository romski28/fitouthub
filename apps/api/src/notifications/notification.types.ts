import { NotificationChannel, NotificationStatus } from '@prisma/client';

export { NotificationChannel, NotificationStatus };

export interface SendNotificationDto {
  userId?: string;
  professionalId?: string;
  phoneNumber: string;
  eventType: string;
  message: string;
  channel?: NotificationChannel;
  metadata?: Record<string, any>;
}

export interface NotificationResponse {
  success: boolean;
  providerId?: string;
  status: NotificationStatus;
  error?: string;
  response?: any;
}

export interface INotificationProvider {
  sendSMS(phoneNumber: string, message: string): Promise<NotificationResponse>;
  sendWhatsApp(phoneNumber: string, message: string): Promise<NotificationResponse>;
  name: string;
}
