import { Controller, Post, Delete, Body, Req, Logger } from '@nestjs/common';
import { PushNotificationService } from './push-notification.service';

interface SubscribeDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  platform?: string;
}

@Controller('api/push')
export class PushNotificationController {
  private readonly logger = new Logger(PushNotificationController.name);

  constructor(private readonly pushService: PushNotificationService) {}

  // ── Subscribe (called from PWA after user logs in) ─────────────
  @Post('subscribe')
  async subscribe(@Body() body: SubscribeDto, @Req() req: any) {
    const userId = req.user?.id || null;
    const professionalId = req.professional?.id || null;

    if (!userId && !professionalId) {
      return { success: false, error: 'Authentication required' };
    }

    await this.pushService.saveSubscription(
      body.endpoint,
      body.keys,
      userId,
      professionalId,
      body.userAgent || req.headers['user-agent'],
      body.platform || undefined,
    );

    this.logger.log(`Push subscribed: userId=${userId}, profId=${professionalId}`);
    return { success: true };
  }

  // ── Unsubscribe ────────────────────────────────────────────────
  @Delete('subscribe')
  async unsubscribe(@Body() body: { endpoint: string }, @Req() req: any) {
    const userId = req.user?.id || null;
    const professionalId = req.professional?.id || null;

    if (!userId && !professionalId) {
      return { success: false, error: 'Authentication required' };
    }

    await this.pushService.removeSubscription(body.endpoint);

    this.logger.log(`Push unsubscribed: userId=${userId}, profId=${professionalId}`);
    return { success: true };
  }

  // ── VAPID public key — for client to fetch ─────────────────────
  @Post('vapid-public-key')
  getVapidPublicKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
    };
  }
}
