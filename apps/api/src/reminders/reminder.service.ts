import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly emailService: EmailService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Two daily digests replace the old "day-before" individual reminders:
   *   - Pros    @ 07:30 HK — quotes due today, site visits today, milestones today.
   *   - Clients @ 09:00 HK — award nudges (tender closed, unawarded), site visits today.
   *
   * Each recipient gets ONE consolidated message (email + SMS/WhatsApp + push)
   * rather than a "hosepipe" of individual notices. Idempotency via ReminderLog
   * (per recipient × date) prevents duplicate sends. Emergency (1h) tenders are
   * excluded from the pro quote reminder.
   */

  @Cron('30 7 * * *', { timeZone: 'Asia/Hong_Kong' })
  async sendProDailyDigest(): Promise<void> {
    this.logger.log('Running pro daily digest job');
    const todayRange = this.getTodayRangeHKT();
    const dateKey = this.getDateKeyHKT(new Date());

    const byPro = await this.collectProItems(todayRange);
    let sent = 0;
    for (const [professionalId, items] of byPro) {
      if (items.length === 0) continue;
      await this.sendProDigest(professionalId, items, dateKey);
      sent += 1;
    }
    this.logger.log(`Pro digest complete: ${sent} professionals`);
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Hong_Kong' })
  async sendClientDailyDigest(): Promise<void> {
    this.logger.log('Running client daily digest job');
    const todayRange = this.getTodayRangeHKT();
    const dateKey = this.getDateKeyHKT(new Date());

    const byClient = await this.collectClientItems(todayRange);
    let sent = 0;
    for (const [userId, items] of byClient) {
      if (items.length === 0) continue;
      await this.sendClientDigest(userId, items, dateKey);
      sent += 1;
    }
    this.logger.log(`Client digest complete: ${sent} clients`);
  }

  // ─── Collectors ───────────────────────────────────────────────────────────

  private async collectProItems(todayRange: DateRange): Promise<Map<string, DigestItem[]>> {
    const map = new Map<string, DigestItem[]>();
    const push = (key: string | null | undefined, item: DigestItem) => {
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    };

    // Quotes due today (tender closing today). Emergency (1h) tenders are skipped.
    const quotePps = await this.prisma.projectProfessional.findMany({
      where: {
        status: { in: ['pending', 'accepted'] },
        quotedAt: null,
        project: {
          isEmergency: false,
          awardedProjectProfessionalId: null,
          tenderClosesAt: { gte: todayRange.start, lt: todayRange.end },
        },
      },
      select: {
        id: true,
        professionalId: true,
        project: { select: { projectName: true } },
      },
    });
    for (const pp of quotePps) {
      push(pp.professionalId, {
        kind: 'quote_due',
        title: 'Submit your quote',
        detail: `Quote due today for "${pp.project.projectName}".`,
        link: `/professional-projects/${pp.id}`,
      });
    }

    // Site visits today.
    const visits = await this.prisma.siteAccessVisit.findMany({
      where: { status: 'accepted', proposedAt: { gte: todayRange.start, lt: todayRange.end } },
      select: {
        professionalId: true,
        proposedAt: true,
        project: { select: { projectName: true } },
      },
    });
    for (const v of visits) {
      push(v.professionalId, {
        kind: 'site_visit',
        title: 'Site visit today',
        detail: `Visit for "${v.project.projectName}" at ${this.formatTimeHKT(v.proposedAt)}.`,
        link: '/professional-projects',
      });
    }

    // Milestones starting today.
    const milestones = await this.prisma.projectMilestone.findMany({
      where: {
        status: { in: ['not_started', 'in_progress'] },
        plannedStartDate: { gte: todayRange.start, lt: todayRange.end },
        projectProfessionalId: { not: null },
      },
      select: {
        title: true,
        plannedStartDate: true,
        projectProfessional: {
          select: { professionalId: true, project: { select: { projectName: true } } },
        },
      },
    });
    for (const m of milestones) {
      push(m.projectProfessional?.professionalId, {
        kind: 'milestone',
        title: 'Milestone starts today',
        detail: `"${m.title}" for "${m.projectProfessional?.project.projectName}".`,
        link: '/professional-projects',
      });
    }

    return map;
  }

  private async collectClientItems(todayRange: DateRange): Promise<Map<string, DigestItem[]>> {
    const map = new Map<string, DigestItem[]>();
    const push = (key: string | null | undefined, item: DigestItem) => {
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    };

    // Award nudges — every day a tender is closed but not yet awarded.
    const projects = await this.prisma.project.findMany({
      where: {
        awardedProjectProfessionalId: null,
        releasedForQuotationAt: { not: null },
        tenderClosesAt: { lt: new Date() },
        status: { not: 'archived' },
      },
      select: { id: true, projectName: true, userId: true, clientId: true },
    });
    for (const p of projects) {
      push(p.userId || p.clientId, {
        kind: 'award_nudge',
        title: 'Award your project',
        detail: `Tender closed for "${p.projectName}" — award a pro to move forward.`,
        link: `/projects/${p.id}`,
      });
    }

    // Site visits today.
    const visits = await this.prisma.siteAccessVisit.findMany({
      where: { status: 'accepted', proposedAt: { gte: todayRange.start, lt: todayRange.end } },
      select: {
        proposedAt: true,
        project: { select: { projectName: true, userId: true, clientId: true } },
      },
    });
    for (const v of visits) {
      push(v.project.userId || v.project.clientId, {
        kind: 'site_visit',
        title: 'Site visit today',
        detail: `Your contractor visits "${v.project.projectName}" at ${this.formatTimeHKT(v.proposedAt)}.`,
        link: '/projects',
      });
    }

    return map;
  }

  // ─── Digest senders ───────────────────────────────────────────────────────

  private async sendProDigest(professionalId: string, items: DigestItem[], dateKey: string): Promise<void> {
    const key = `digest:pro:${professionalId}:${dateKey}`;
    if (await this.alreadySent(key)) return;

    const pro = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: { id: true, fullName: true, businessName: true, phone: true, email: true },
    });
    if (!pro) return;

    const name = pro.fullName || pro.businessName || 'there';
    const heading = `${items.length} item${items.length === 1 ? '' : 's'} today`;

    if (pro.email) {
      await this.sendDigestEmail({
        to: pro.email,
        subject: `Your Mimo day — ${heading}`,
        greeting: `Hi ${name},`,
        items,
        ctaUrl: `${this.webUrl()}/professional-projects`,
      });
    }
    if (pro.phone) {
      await this.notificationService.send({
        professionalId,
        phoneNumber: pro.phone,
        eventType: 'daily_digest',
        message: `Hi ${name}, you have ${heading} on Mimo. Open the app for details.`,
      });
    }
    await this.pushNotificationService.sendToProfessional(professionalId, {
      title: 'You have things to do today',
      body: 'Go to the app for details',
      url: `${this.webUrl()}/professional-projects`,
      tag: `digest-pro-${dateKey}`,
    });

    await this.markSent(key);
  }

  private async sendClientDigest(userId: string, items: DigestItem[], dateKey: string): Promise<void> {
    const key = `digest:client:${userId}:${dateKey}`;
    if (await this.alreadySent(key)) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, mobile: true, email: true },
    });
    if (!user) return;

    const name = user.firstName || 'there';
    const heading = `${items.length} item${items.length === 1 ? '' : 's'} today`;

    if (user.email) {
      await this.sendDigestEmail({
        to: user.email,
        subject: `Your Mimo day — ${heading}`,
        greeting: `Hi ${name},`,
        items,
        ctaUrl: `${this.webUrl()}/projects`,
      });
    }
    if (user.mobile) {
      await this.notificationService.send({
        userId,
        phoneNumber: user.mobile,
        eventType: 'daily_digest',
        message: `Hi ${name}, you have ${heading} on Mimo. Open the app for details.`,
      });
    }
    await this.pushNotificationService.sendToUser(userId, {
      title: 'You have things to do today',
      body: 'Go to the app for details',
      url: `${this.webUrl()}/projects`,
      tag: `digest-client-${dateKey}`,
    });

    await this.markSent(key);
  }

  private webUrl(): string {
    return process.env.WEB_APP_URL || 'https://fitouthub.com';
  }

  /** Today's digest items for a given actor, used by the in-app "Today" card. */
  async getTodayItems(
    actor: { role: 'client' | 'professional'; id: string },
  ): Promise<{ items: DigestItem[]; openTenders: number }> {
    const todayRange = this.getTodayRangeHKT();
    if (actor.role === 'professional') {
      const map = await this.collectProItems(todayRange);
      const openTenders = await this.countOpenTendersForPro(actor.id);
      return { items: map.get(actor.id) ?? [], openTenders };
    }
    const map = await this.collectClientItems(todayRange);
    const openTenders = await this.countOpenTendersForClient(actor.id);
    return { items: map.get(actor.id) ?? [], openTenders };
  }

  private async countOpenTendersForPro(professionalId: string): Promise<number> {
    return this.prisma.projectProfessional.count({
      where: {
        professionalId,
        status: { in: ['pending', 'accepted'] },
        quotedAt: null,
        project: {
          awardedProjectProfessionalId: null,
          releasedForQuotationAt: { not: null },
          tenderClosesAt: { gt: new Date() },
        },
      },
    });
  }

  private async countOpenTendersForClient(userId: string): Promise<number> {
    return this.prisma.project.count({
      where: {
        OR: [{ userId }, { clientId: userId }],
        awardedProjectProfessionalId: null,
        releasedForQuotationAt: { not: null },
        tenderClosesAt: { gt: new Date() },
      },
    });
  }

  // NOTE: the methods below (processAcceptedVisits, processScheduledAccessRequests,
  // sendClientReminder, sendProfessionalReminder, sendReminderEmail, and
  // processScheduledMilestones) are the superseded "day-before" individual
  // reminder pipeline. They are no longer called (replaced by the daily digests)
  // and are retained for now pending cleanup.

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
      `Log in to Mimo to view details.`;

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
      `for project "${params.projectName}" on Mimo. ` +
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
        detail: `Please ensure you arrive on time and log your visit in Mimo after completion.`,
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
        from: 'Mimo <noreply@mail.romski.me.uk>',
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
                View in Mimo
              </a>
            </p>
            <p style="font-size:12px;color:#6b7280;margin-top:24px;">
              You are receiving this because you have a confirmed appointment on Mimo.
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.warn(`Email reminder failed for ${params.to}: ${(err as Error).message}`);
    }
  }

  // ─── Digest email helper ──────────────────────────────────────────────────

  private async sendDigestEmail(params: {
    to: string;
    subject: string;
    greeting: string;
    items: DigestItem[];
    ctaUrl: string;
  }): Promise<void> {
    const itemsHtml = params.items
      .map(
        (it) =>
          `<li style="margin-bottom:8px;"><strong>${it.title}</strong><br/><span style="color:#4b5563;">${it.detail}</span> <a href="${params.ctaUrl}${it.link}" style="color:#4f46e5;">View</a></li>`,
      )
      .join('');
    try {
      await (this.emailService as any).resend?.emails.send({
        from: 'Mimo <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: params.subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#4f46e5;">Your Mimo Day</h2>
            <p>${params.greeting}</p>
            <p>Here is your day on Mimo:</p>
            <ul style="padding-left:18px;">${itemsHtml}</ul>
            <p style="margin-top:24px;">
              <a href="${params.ctaUrl}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Open Mimo</a>
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.warn(`Digest email failed for ${params.to}: ${(err as Error).message}`);
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

  // ─── Scheduled Milestones ─────────────────────────────────────────────────

  private async processScheduledMilestones(): Promise<void> {
    const tomorrowRange = this.getTomorrowRangeHKT();
    const milestones = await this.prisma.projectMilestone.findMany({
      where: {
        status: { in: ['not_started', 'in_progress'] },
        plannedStartDate: { gte: tomorrowRange.start, lt: tomorrowRange.end },
        projectProfessionalId: { not: null },
      },
      include: {
        project: { select: { id: true, projectName: true } },
        projectProfessional: {
          select: {
            professionalId: true,
            professional: {
              select: { id: true, fullName: true, businessName: true, phone: true, email: true },
            },
          },
        },
      },
    });

    for (const milestone of milestones) {
      const pro = milestone.projectProfessional?.professional;
      if (!pro) continue;

      const dateLabel = milestone.plannedStartDate
        ? this.formatDateHKT(milestone.plannedStartDate)
        : 'tomorrow';
      const key = `milestone:${milestone.id}:dayBefore:${dateLabel}`;
      if (await this.alreadySent(key)) continue;

      const proName = pro.fullName || pro.businessName || 'Professional';
      const projectName = milestone.project.projectName;

      // Post to project chat thread
      try {
        const thread = await this.chatService.getOrCreateProjectThread(milestone.project.id);
        const chatContent = [
          `[[event]]`,
          JSON.stringify({
            type: 'generic',
            icon: '📅',
            title: `Reminder: ${milestone.title}`,
            summary: [
              `Project: ${projectName}`,
              `Starts: ${dateLabel}${milestone.startTimeSlot ? ` (${milestone.startTimeSlot})` : ''}`,
              milestone.siteAccessRequired ? 'Site access required.' : '',
            ]
              .filter(Boolean)
              .join('\n'),
          }),
        ].join('');
        await this.chatService.addProjectMessage(
          thread.id,
          'system',
          null,
          pro.id,
          chatContent,
          [],
        );
      } catch (chatErr) {
        this.logger.warn(`Milestone reminder chat post failed for ${milestone.id}: ${(chatErr as Error).message}`);
      }

      // SMS/WhatsApp via existing notification pipeline
      const message = `Hi ${proName}, reminder: milestone "${milestone.title}" for project "${projectName}" starts ${dateLabel}. Log in to Mimo for details.`;
      if (pro.phone) {
        await this.notificationService.send({
          professionalId: pro.id,
          phoneNumber: pro.phone,
          eventType: 'milestone_reminder',
          message,
        });
      }

      // Email fallback
      if (pro.email) {
        await this.sendReminderEmail({
          to: pro.email,
          subject: `Reminder: "${milestone.title}" starts ${dateLabel}`,
          greeting: `Hi ${proName},`,
          body: `Milestone <strong>${milestone.title}</strong> for project <strong>${projectName}</strong> starts <strong>${dateLabel}</strong>.`,
          detail: milestone.siteAccessRequired ? 'Site access is required.' : 'Review your schedule and confirm readiness.',
        });
      }

      await this.markSent(key);
    }

    this.logger.log(`Milestone reminders processed: ${milestones.length} milestones`);
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

  private getTodayRangeHKT(): DateRange {
    const nowHKT = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }),
    );
    const startHKT = new Date(nowHKT);
    startHKT.setHours(0, 0, 0, 0);
    const endHKT = new Date(startHKT);
    endHKT.setDate(endHKT.getDate() + 1);
    const hktOffsetMs = 8 * 60 * 60 * 1000;
    return {
      start: new Date(startHKT.getTime() - hktOffsetMs),
      end: new Date(endHKT.getTime() - hktOffsetMs),
    };
  }

  private getDateKeyHKT(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
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

interface DigestItem {
  kind: 'quote_due' | 'site_visit' | 'milestone' | 'award_nudge';
  title: string;
  detail: string;
  link: string;
}

export type { DigestItem };
