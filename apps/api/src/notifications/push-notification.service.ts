import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as webpush from 'web-push';

// ── VAPID Keys ────────────────────────────────────────────────────
// Generate once: npx web-push generate-vapid-keys
// Store in env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@fitouthub.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
  actions?: Array<{ action: string; title: string }>;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(private prisma: PrismaService) {}

  // ── Save a subscription ────────────────────────────────────────
  async saveSubscription(
    endpoint: string,
    keys: { p256dh: string; auth: string },
    userId?: string,
    professionalId?: string,
    userAgent?: string,
    platform?: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId: userId || null,
        professionalId: professionalId || null,
        userAgent: userAgent || null,
        platform: platform || null,
        active: true,
        updatedAt: new Date(),
      },
      create: {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId: userId || null,
        professionalId: professionalId || null,
        userAgent: userAgent || null,
        platform: platform || null,
        active: true,
      },
    });
  }

  // ── Remove a subscription ──────────────────────────────────────
  async removeSubscription(endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });
  }

  // ── Deactivate (soft-delete) ───────────────────────────────────
  async deactivateSubscription(endpoint: string) {
    return this.prisma.pushSubscription.updateMany({
      where: { endpoint },
      data: { active: false, updatedAt: new Date() },
    });
  }

  // ── Push to a single user ──────────────────────────────────────
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, active: true },
    });
    return this.sendToSubscriptions(subs, payload);
  }

  // ── Push to a single professional ──────────────────────────────
  async sendToProfessional(professionalId: string, payload: PushPayload): Promise<number> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { professionalId, active: true },
    });
    return this.sendToSubscriptions(subs, payload);
  }

  // ── Push to both user & professional (e.g., new chat message) ──
  async sendToUserAndProfessional(
    userId: string | undefined,
    professionalId: string | undefined,
    payload: PushPayload,
  ): Promise<{ userSent: number; professionalSent: number }> {
    const [userSent, professionalSent] = await Promise.all([
      userId ? this.sendToUser(userId, payload) : Promise.resolve(0),
      professionalId ? this.sendToProfessional(professionalId, payload) : Promise.resolve(0),
    ]);
    return { userSent, professionalSent };
  }

  // ── Send to list of subscriptions ──────────────────────────────
  private async sendToSubscriptions(
    subs: Array<{ endpoint: string; p256dh: string; auth: string }>,
    payload: PushPayload,
  ): Promise<number> {
    if (!vapidPublicKey || !vapidPrivateKey) {
      this.logger.warn('VAPID keys not configured — skipping push');
      return 0;
    }

    let sent = 0;
    const pushPayload = JSON.stringify(payload);

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload,
        );
        sent++;
      } catch (err: any) {
        this.logger.warn(`Push failed for ${sub.endpoint}: ${err.message}`);
        // If subscription is gone (410) or invalid (404), deactivate it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.deactivateSubscription(sub.endpoint).catch(() => {});
        }
      }
    }

    this.logger.log(`Push sent: ${sent}/${subs.length} delivered`);
    return sent;
  }
}
