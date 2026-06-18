import { Controller, Post, Delete, Body, Req, Logger, UseGuards } from '@nestjs/common';
import { PushNotificationService } from './push-notification.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

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
  @UseGuards(CombinedAuthGuard)
  async subscribe(@Body() body: SubscribeDto, @Req() req: any) {
    // CombinedAuthGuard sets req.user.id and req.user.isProfessional
    const userId = !req.user?.isProfessional ? req.user?.id : null;
    const professionalId = req.user?.isProfessional ? req.user?.id : null;

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
  @UseGuards(CombinedAuthGuard)
  async unsubscribe(@Body() body: { endpoint: string }, @Req() req: any) {
    const userId = !req.user?.isProfessional ? req.user?.id : null;
    const professionalId = req.user?.isProfessional ? req.user?.id : null;

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
