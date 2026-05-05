import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Runs daily at 09:00 Hong Kong Time.
   * Sends day-before reminders for all confirmed site visits and scheduled
   * site access requests occurring tomorrow. Both the client and the
   * professional receive a tailored WhatsApp/SMS + email message.
   * An idempotency key per (appointment × role × date) prevents duplicate
   * sends if the cron fires more than once in a day.
   */
  @Cron('0 9 * * *', { timeZone: 'Asia/Hong_Kong' })
  async sendDayBeforeReminders(): Promise<void> {
    this.logger.log('Running day-before site visit reminder job');

    const tomorrowRange = this.getTomorrowRangeHKT();

    await Promise.all([
      this.processAcceptedVisits(tomorrowRange),
      this.processScheduledAccessRequests(tomorrowRange),
    ]);

    this.logger.log('Day-before reminder job complete');
  }

  // ─── Accepted SiteAccessVisits ────────────────────────────────────────────

  private async processAcceptedVisits(range: DateRange): Promise<void> {
    const visits = await this.prisma.siteAccessVisit.findMany({
      where: {
        status: 'accepted',
        proposedAt: { gte: range.start, lt: range.end },
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            userId: true,
          },
        },
        professional: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    for (const visit of visits) {
      const dateLabel = this.formatDateHKT(visit.proposedAt);
      const timeLabel = this.formatTimeHKT(visit.proposedAt);
      const projectName = visit.project.projectName;
      const proName = visit.professional.fullName || visit.professional.businessName || 'Your contractor';

      await Promise.all([
        this.sendClientReminder({
          key: `visit:${visit.id}:client:${dateLabel}`,
          userId: visit.project.userId ?? undefined,
          projectName,
          dateLabel,
          timeLabel,
          counterpartName: proName,
          role: 'client',
        }),
        this.sendProfessionalReminder({
          key: `visit:${visit.id}:professional:${dateLabel}`,
          professionalId: visit.professionalId,
          professionalPhone: visit.professional.phone,
          professionalEmail: visit.professional.email,
          professionalName: proName,
          projectName,
          dateLabel,
          timeLabel,
          role: 'professional',
        }),
      ]);
    }
  }

  // ─── Scheduled SiteAccessRequests ─────────────────────────────────────────

  private async processScheduledAccessRequests(range: DateRange): Promise<void> {
    // visitScheduledAt is a full DateTime; visitScheduledFor is a Date-only field.
    // We check both so neither is missed.
    const requests = await this.prisma.siteAccessRequest.findMany({
      where: {
        status: 'approved_visit_scheduled',
        OR: [
          { visitScheduledAt: { gte: range.start, lt: range.end } },
          { visitScheduledFor: { gte: range.start, lt: range.end } },
        ],
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            userId: true,
          },
        },
        professional: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    for (const req of requests) {
      const visitAt = req.visitScheduledAt ?? req.visitScheduledFor;
      const dateLabel = visitAt ? this.formatDateHKT(visitAt) : 'tomorrow';
      const timeLabel = req.visitScheduledAt ? this.formatTimeHKT(req.visitScheduledAt) : '';
      const projectName = req.project.projectName;
      const proName = req.professional.fullName || req.professional.businessName || 'Your contractor';

      await Promise.all([
        this.sendClientReminder({
          key: `request:${req.id}:client:${dateLabel}`,
          userId: req.project.userId ?? undefined,
          projectName,
          dateLabel,
          timeLabel,
          counterpartName: proName,
          role: 'client',
        }),
        this.sendProfessionalReminder({
          key: `request:${req.id}:professional:${dateLabel}`,
          professionalId: req.professionalId,
          professionalPhone: req.professional.phone,
          professionalEmail: req.professional.email,
          professionalName: proName,
          projectName,
          dateLabel,
          timeLabel,
          role: 'professional',
        }),
      ]);
    }
  }

  // ─── Sender helpers ────────────────────────────────────────────────────────

  private async sendClientReminder(params: {
    key: string;
    userId: string | undefined;
    projectName: string;
    dateLabel: string;
    timeLabel: string;
    counterpartName: string;
    role: 'client';
  }): Promise<void> {
    if (!params.userId) return;
    if (await this.alreadySent(params.key)) return;

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { mobile: true, email: true, firstName: true, surname: true },
    });
    if (!user) return;

    const greeting = user.firstName ? `Hi ${user.firstName},` : 'Hi,';
    const timeClause = params.timeLabel ? ` at ${params.timeLabel}` : '';
    const message =
      `${greeting} Reminder: you have a site inspection tomorrow (${params.dateLabel}${timeClause}) ` +
      `for project "${params.projectName}" with ${params.counterpartName}. ` +
      `Log in to Fitout Hub to view details.`;

    // WhatsApp / SMS via NotificationService
    if (user.mobile) {
      await this.notificationService.send({
        userId: params.userId,
        phoneNumber: user.mobile,
        eventType: 'site_visit_reminder',
        message,
      });
    }

    // Email fallback
    if (user.email) {
      await this.sendReminderEmail({
        to: user.email,
        subject: `Reminder: site inspection tomorrow for "${params.projectName}"`,
        greeting,
        body: `You have a confirmed site inspection <strong>tomorrow, ${params.dateLabel}${timeClause}</strong> for project <strong>${params.projectName}</strong>.`,
        detail: `Your contractor <strong>${params.counterpartName}</strong> will be on site.`,
      });
    }

    await this.markSent(params.key);
  }

  private async sendProfessionalReminder(params: {
    key: string;
    professionalId: string;
    professionalPhone: string;
    professionalEmail: string;
    professionalName: string;
    projectName: string;
    dateLabel: string;
    timeLabel: string;
    role: 'professional';
  }): Promise<void> {
    if (await this.alreadySent(params.key)) return;

    const timeClause = params.timeLabel ? ` at ${params.timeLabel}` : '';
    const greeting = `Hi ${params.professionalName},`;
    const message =
      `${greeting} Reminder: you have a site visit tomorrow (${params.dateLabel}${timeClause}) ` +
      `for project "${params.projectName}" on Fitout Hub. ` +
      `Log in to confirm your attendance.`;

    // WhatsApp / SMS
    if (params.professionalPhone) {
      await this.notificationService.send({
        professionalId: params.professionalId,
        phoneNumber: params.professionalPhone,
        eventType: 'site_visit_reminder',
        message,
      });
    }

    // Email
    if (params.professionalEmail) {
      await this.sendReminderEmail({
        to: params.professionalEmail,
        subject: `Reminder: site visit tomorrow for "${params.projectName}"`,
        greeting,
        body: `You have a confirmed site visit <strong>tomorrow, ${params.dateLabel}${timeClause}</strong> for project <strong>${params.projectName}</strong>.`,
        detail: `Please ensure you arrive on time and log your visit in Fitout Hub after completion.`,
      });
    }

    await this.markSent(params.key);
  }

  // ─── Email helper ──────────────────────────────────────────────────────────

  private async sendReminderEmail(params: {
    to: string;
    subject: string;
    greeting: string;
    body: string;
    detail: string;
  }): Promise<void> {
    try {
      // EmailService exposes a generic send via Resend — build our own html here
      // and call the underlying resend client via the typed helper pattern.
      await (this.emailService as any).resend?.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: params.subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#4f46e5;">Site Visit Reminder</h2>
            <p>${params.greeting}</p>
            <p>${params.body}</p>
            <p>${params.detail}</p>
            <p style="margin-top:24px;">
              <a href="${process.env.WEB_APP_URL || 'https://fitouthub.com'}/projects"
                 style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
                View in Fitout Hub
              </a>
            </p>
            <p style="font-size:12px;color:#6b7280;margin-top:24px;">
              You are receiving this because you have a confirmed appointment on Fitout Hub.
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.warn(`Email reminder failed for ${params.to}: ${(err as Error).message}`);
    }
  }

  // ─── Idempotency ───────────────────────────────────────────────────────────

  private async alreadySent(key: string): Promise<boolean> {
    const existing = await this.prisma.reminderLog.findUnique({
      where: { reminderKey: key },
    });
    return !!existing;
  }

  private async markSent(key: string): Promise<void> {
    try {
      await this.prisma.reminderLog.create({
        data: { reminderKey: key },
      });
    } catch {
      // Unique constraint violation means it was already written by a concurrent run — safe to ignore
    }
  }

  // ─── Date helpers ──────────────────────────────────────────────────────────

  private getTomorrowRangeHKT(): DateRange {
    const nowHKT = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }),
    );
    const tomorrowHKT = new Date(nowHKT);
    tomorrowHKT.setDate(tomorrowHKT.getDate() + 1);
    tomorrowHKT.setHours(0, 0, 0, 0);

    const dayAfterHKT = new Date(tomorrowHKT);
    dayAfterHKT.setDate(dayAfterHKT.getDate() + 1);

    // Convert back to UTC for the Prisma query
    const hktOffsetMs = 8 * 60 * 60 * 1000;
    return {
      start: new Date(tomorrowHKT.getTime() - hktOffsetMs),
      end: new Date(dayAfterHKT.getTime() - hktOffsetMs),
    };
  }

  private formatDateHKT(date: Date): string {
    return date.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  private formatTimeHKT(date: Date): string {
    return date.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

interface DateRange {
  start: Date;
  end: Date;
}
