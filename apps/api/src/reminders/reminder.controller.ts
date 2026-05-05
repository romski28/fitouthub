import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationChannel } from '../notifications/notification.types';

interface SendTestReminderBody {
  phoneNumber: string;
  message?: string;
  userId?: string;
  professionalId?: string;
  channel?: NotificationChannel;
}

@Controller('internal/reminders')
export class ReminderController {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post('run-day-before')
  @HttpCode(200)
  async runDayBeforeReminders(@Req() req: any) {
    this.assertInternalSecret(req);
    await this.reminderService.sendDayBeforeReminders();
    return { success: true };
  }

  @Post('send-test')
  @HttpCode(200)
  async sendTestReminder(@Req() req: any, @Body() body: SendTestReminderBody) {
    this.assertInternalSecret(req);

    if (!body?.phoneNumber) {
      throw new BadRequestException('phoneNumber is required');
    }

    if (!body.userId && !body.professionalId) {
      throw new BadRequestException('userId or professionalId is required');
    }

    const response = await this.notificationService.send({
      userId: body.userId,
      professionalId: body.professionalId,
      phoneNumber: body.phoneNumber,
      channel: body.channel,
      eventType: 'site_visit_reminder_test',
      message:
        body.message ||
        'Test reminder from Fitout Hub. Day-before reminders are configured and sending successfully.',
    });

    return {
      success: response.success,
      status: response.status,
      providerId: response.providerId,
      error: response.error,
    };
  }

  private assertInternalSecret(req: any): void {
    const expectedSecret =
      process.env.REMINDER_CRON_SECRET || process.env.INTERNAL_REMINDER_SECRET;

    if (!expectedSecret) {
      throw new ForbiddenException(
        'Reminder secret is not configured on the server',
      );
    }

    const suppliedSecret = req.headers['x-internal-secret'];
    if (!suppliedSecret || suppliedSecret !== expectedSecret) {
      throw new ForbiddenException('Invalid internal secret');
    }
  }
}
