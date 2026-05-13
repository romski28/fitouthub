import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationChannel } from '../notifications/notification.types';
import { createHash } from 'crypto';

interface CreateAssistRequestDto {
  projectId: string;
  userId?: string;
  professionalId?: string;  // professional raising the request
  raisedBy?: 'client' | 'professional' | 'foh';
  category?: 'payment' | 'delay' | 'quality' | 'safety' | 'dispute' | 'general';
  notes?: string;
  clientName?: string;
  projectName?: string;
  contactMethod?: 'chat' | 'call' | 'whatsapp';
  requestedCallAt?: string;
  requestedCallTimezone?: string;
  bookingChannel?: 'app' | 'ai_guest_quick' | 'ai_logged_in' | 'manual_admin';
  leadLifecycleAtBooking?: 'active' | 'prospective' | 'suspended' | 'blocked';
  consultationDurationMin?: number;
  contactEmailSnapshot?: string | null;
  contactMobileSnapshot?: string | null;
}

interface CreateAiConsultationBookingDto {
  lead: {
    name: string;
    email?: string;
    mobile?: string;
  };
  project: {
    projectName?: string;
    region?: string;
    notes?: string;
    tradesRequired?: string[];
    userPrompt?: string;
    aiIntakeId?: string;
    projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
    isEmergency?: boolean;
  };
  assist: {
    notes?: string;
    contactMethod?: 'chat' | 'call' | 'whatsapp';
    requestedCallAt?: string;
    requestedCallTimezone?: string;
  };
  context?: {
    source?: string;
    ip?: string;
    userAgent?: string;
  };
}

interface GuestLeadPrecheckDto {
  email?: string;
  mobile?: string;
}

interface MirrorSupportPoolParams {
  projectId: string;
  contactMethod: 'chat' | 'call' | 'whatsapp';
  requestedCallAt: Date | null;
  requestedCallTimezone?: string;
  notes?: string;
  clientName?: string;
  clientEmail?: string;
  phone?: string;
}

@Injectable()
export class AssistRequestsService {
  private readonly emergencyCloseMs = 60 * 60 * 1000;
  private readonly defaultCloseMs = 12 * 60 * 60 * 1000;

  private formatClosureNotice(dueAt: Date, reason?: string | null): string {
    const formattedDueAt = dueAt.toLocaleString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return [
      'Fitout Hub marked this assistance thread as pending closure.',
      reason ? `Reason: ${reason}.` : null,
      `It will auto-close after ${formattedDueAt}. Reply here if you still need help.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private appendTimelineEvent(
    existing: unknown,
    event: {
      action: string;
      status: string;
      actorId?: string | null;
      reason?: string | null;
      mode?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    const timeline = Array.isArray(existing) ? [...existing] : [];
    timeline.push({
      at: new Date().toISOString(),
      action: event.action,
      status: event.status,
      actorId: event.actorId ?? null,
      reason: event.reason ?? null,
      mode: event.mode ?? null,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    });
    return timeline;
  }

  private async finalizeExpiredClosures() {
    const now = new Date();
    const expiring = await (this.prisma as any).projectAssistRequest.findMany({
      where: {
        status: 'closure_pending',
        closureDueAt: { lte: now },
      },
      select: { id: true, statusTimeline: true },
      take: 200,
    });

    if (!expiring.length) return;

    await Promise.all(
      expiring.map((item: any) =>
        (this.prisma as any).projectAssistRequest.update({
          where: { id: item.id },
          data: {
            status: 'closed',
            resolvedAt: now,
            resolutionMode: 'sla_timeout',
            resolutionReason: 'SLA timeout after closure request',
            statusTimeline: this.appendTimelineEvent(item.statusTimeline, {
              action: 'auto_resolved',
              status: 'closed',
              mode: 'sla_timeout',
              reason: 'SLA timeout after closure request',
            }),
          },
        }),
      ),
    );
  }

  private async mirrorToSupportPool(params: MirrorSupportPoolParams) {
    if (params.contactMethod === 'chat') return;

    const channel = params.contactMethod === 'whatsapp' ? 'whatsapp' : 'callback';
    const methodLabel =
      params.contactMethod === 'call' ? 'Book a call' : 'Please WhatsApp me';

    const requestedSlot = params.requestedCallAt
      ? params.requestedCallAt.toLocaleString('en-GB', {
          timeZone: params.requestedCallTimezone || 'Asia/Hong_Kong',
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

    const body = [
      `Assist request: ${methodLabel}`,
      requestedSlot ? `Requested call slot: ${requestedSlot} (${params.requestedCallTimezone || 'Asia/Hong_Kong'})` : null,
      params.notes?.trim() ? `Client notes: ${params.notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const existingOpen = await this.prisma.supportRequest.findFirst({
      where: {
        projectId: params.projectId,
        channel,
        status: { not: 'resolved' },
        body: { startsWith: `Assist request: ${methodLabel}` },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingOpen) return;

    await this.prisma.supportRequest.create({
      data: {
        channel,
        fromNumber: params.phone || null,
        clientName: params.clientName || null,
        clientEmail: params.clientEmail || null,
        body,
        projectId: params.projectId,
        status: 'unassigned',
        replies: [],
      },
    });
  }

  private sha256(input?: string | null) {
    if (!input || !input.trim()) return null;
    return createHash('sha256').update(input.trim()).digest('hex');
  }

  private normalizeEmail(input?: string | null) {
    return (input || '').trim().toLowerCase();
  }

  private normalizePhoneDigits(input?: string | null) {
    return (input || '').replace(/\D/g, '');
  }

  private buildHongKongMobileVariants(input?: string | null) {
    const raw = (input || '').trim();
    if (!raw) return [] as string[];

    const digits = this.normalizePhoneDigits(raw);
    if (!digits) return [] as string[];

    const local = digits.startsWith('852') && digits.length > 8 ? digits.slice(3) : digits;
    const variants = new Set<string>([
      raw,
      digits,
      `+${digits}`,
    ]);

    if (local.length === 8) {
      variants.add(local);
      variants.add(`852${local}`);
      variants.add(`+852${local}`);
    }

    return Array.from(variants);
  }

  private normalizeHongKongMobileForOutbound(input?: string | null) {
    const raw = (input || '').trim();
    if (!raw) return null;

    const digits = this.normalizePhoneDigits(raw);
    if (!digits) return null;

    if (raw.startsWith('+')) return `+${digits}`;
    if (digits.length === 8) return `+852${digits}`;
    if (digits.startsWith('852')) return `+${digits}`;
    return `+${digits}`;
  }

  async precheckAiConsultationGuestLead(dto: GuestLeadPrecheckDto) {
    const email = this.normalizeEmail(dto.email);
    const mobileVariants = this.buildHongKongMobileVariants(dto.mobile);

    if (!email && mobileVariants.length === 0) {
      return {
        eligible: false,
        code: 'MISSING_CONTACT',
        message: 'Please provide either email or mobile.',
      };
    }

    if (email) {
      const emailConflict = await this.prisma.user.findFirst({
        where: { email },
        select: { id: true, role: true },
      });
      if (emailConflict) {
        return {
          eligible: false,
          code: 'EMAIL_EXISTS',
          message: 'This email address is already in our system. Please log in to continue.',
        };
      }
    }

    if (mobileVariants.length > 0) {
      const mobileConflict = await this.prisma.user.findFirst({
        where: { mobile: { in: mobileVariants } },
        select: { id: true, role: true },
      });
      if (mobileConflict) {
        return {
          eligible: false,
          code: 'MOBILE_EXISTS',
          message: 'This mobile number is already in our system. Please log in to continue.',
        };
      }
    }

    return { eligible: true as const };
  }

  private async logProspectiveLeadEvent(payload: {
    userId?: string | null;
    projectId?: string | null;
    assistRequestId?: string | null;
    eventType: string;
    source?: string | null;
    ipHash?: string | null;
    uaHash?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "ProspectiveLeadEvent"
          ("userId", "projectId", "assistRequestId", "eventType", "source", "ipHash", "uaHash", "metadata", "createdAt")
        VALUES
          (${payload.userId ?? null}, ${payload.projectId ?? null}, ${payload.assistRequestId ?? null}, ${payload.eventType}, ${payload.source ?? null}, ${payload.ipHash ?? null}, ${payload.uaHash ?? null}, ${JSON.stringify(payload.metadata ?? {})}::jsonb, NOW())
      `;
    } catch (error) {
      console.warn('[AssistRequestsService] Failed to write ProspectiveLeadEvent:', (error as Error)?.message);
    }
  }

  private async updateUserProspectiveState(payload: {
    userId: string;
    source?: string | null;
    created?: boolean;
    ipHash?: string | null;
    uaHash?: string | null;
  }) {
    try {
      if (payload.created) {
        await this.prisma.$executeRaw`
          UPDATE "User"
          SET
            "lifecycleStatus" = 'prospective',
            "prospectiveSource" = COALESCE(${payload.source ?? null}, "prospectiveSource"),
            "prospectiveCreatedAt" = COALESCE("prospectiveCreatedAt", NOW()),
            "prospectiveLastActivityAt" = NOW(),
            "lastSeenIpHash" = COALESCE(${payload.ipHash ?? null}, "lastSeenIpHash"),
            "lastSeenUaHash" = COALESCE(${payload.uaHash ?? null}, "lastSeenUaHash")
          WHERE "id" = ${payload.userId}
        `;
      } else {
        await this.prisma.$executeRaw`
          UPDATE "User"
          SET
            "prospectiveLastActivityAt" = NOW(),
            "lastSeenIpHash" = COALESCE(${payload.ipHash ?? null}, "lastSeenIpHash"),
            "lastSeenUaHash" = COALESCE(${payload.uaHash ?? null}, "lastSeenUaHash")
          WHERE "id" = ${payload.userId}
        `;
      }
    } catch (error) {
      console.warn('[AssistRequestsService] Failed to update user prospective state:', (error as Error)?.message);
    }
  }

  private async updateProjectLeadState(payload: {
    projectId: string;
    leadType: 'prospective' | 'registered';
    leadSource?: string | null;
  }) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Project"
        SET
          "leadType" = ${payload.leadType},
          "leadSource" = COALESCE(${payload.leadSource ?? null}, "leadSource"),
          "leadCapturedAt" = COALESCE("leadCapturedAt", NOW())
        WHERE "id" = ${payload.projectId}
      `;
    } catch (error) {
      console.warn('[AssistRequestsService] Failed to update project lead state:', (error as Error)?.message);
    }
  }

  private async updateAssistBookingMetadata(payload: {
    assistRequestId: string;
    bookingChannel?: 'app' | 'ai_guest_quick' | 'ai_logged_in' | 'manual_admin';
    leadLifecycleAtBooking?: 'active' | 'prospective' | 'suspended' | 'blocked';
    consultationDurationMin?: number;
    contactEmailSnapshot?: string | null;
    contactMobileSnapshot?: string | null;
  }) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "ProjectAssistRequest"
        SET
          "bookingChannel" = COALESCE(${payload.bookingChannel ?? null}, "bookingChannel"),
          "leadLifecycleAtBooking" = COALESCE(${payload.leadLifecycleAtBooking ?? null}, "leadLifecycleAtBooking"),
          "consultationDurationMin" = COALESCE(${payload.consultationDurationMin ?? null}, "consultationDurationMin"),
          "contactEmailSnapshot" = COALESCE(${payload.contactEmailSnapshot ?? null}, "contactEmailSnapshot"),
          "contactMobileSnapshot" = COALESCE(${payload.contactMobileSnapshot ?? null}, "contactMobileSnapshot")
        WHERE "id" = ${payload.assistRequestId}
      `;
    } catch (error) {
      console.warn('[AssistRequestsService] Failed to update assist booking metadata:', (error as Error)?.message);
    }
  }

  async createAiConsultationBooking(dto: CreateAiConsultationBookingDto) {
    const name = (dto.lead?.name || '').trim();
    const email = this.normalizeEmail(dto.lead?.email);
    const mobile = (dto.lead?.mobile || '').trim();

    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (!email && !mobile) {
      throw new BadRequestException('Either email or mobile is required');
    }

    const [firstNameRaw, ...surnameParts] = name.split(/\s+/).filter(Boolean);
    const firstName = firstNameRaw || 'Guest';
    const surname = surnameParts.join(' ') || 'Client';

    const prospectiveEmail = email || `prospective_${Date.now().toString(36)}@prospect.fitouthub.local`;
    const ipHash = this.sha256(dto.context?.ip);
    const uaHash = this.sha256(dto.context?.userAgent);
    const source = dto.context?.source || 'ai_guest_quick';
    const requestedContactMethod = dto.assist?.contactMethod || 'chat';

    const precheck = await this.precheckAiConsultationGuestLead({ email, mobile });
    if (!precheck.eligible) {
      throw new BadRequestException(precheck.message);
    }

    const nicknameBase = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'guest';
    const nickname = `prospective-${nicknameBase}-${Math.random().toString(36).slice(2, 7)}`;

    const bookingUser = await this.prisma.user.create({
      data: {
        nickname,
        firstName,
        surname,
        email: prospectiveEmail,
        mobile: mobile || null,
        passwordHash: `prospective-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'client',
        emailVerified: false,
      },
      select: { id: true, firstName: true, surname: true, email: true, emailVerified: true, role: true },
    });

    await this.updateUserProspectiveState({
      userId: bookingUser.id,
      source,
      created: true,
      ipHash,
      uaHash,
    });
    await this.logProspectiveLeadEvent({
      userId: bookingUser.id,
      eventType: 'prospective_user_created',
      source,
      ipHash,
      uaHash,
      metadata: { via: 'assist.ai-consultation' },
    });

    const projectName = (dto.project?.projectName || 'AI consultation project').trim().slice(0, 180);
    const region = (dto.project?.region || 'Hong Kong').trim();
    const notes = (dto.project?.notes || 'AI consultation request').trim();
    const tradesRequired = Array.isArray(dto.project?.tradesRequired)
      ? dto.project.tradesRequired.filter((trade): trade is string => typeof trade === 'string' && trade.trim().length > 0)
      : [];

    const project = await this.prisma.project.create({
      data: {
        projectName,
        clientName: `${bookingUser.firstName} ${bookingUser.surname}`.trim(),
        region,
        notes,
        tradesRequired,
        userPrompt: dto.project?.userPrompt?.trim() || null,
        aiIntakeId: dto.project?.aiIntakeId || null,
        projectScale: dto.project?.projectScale || null,
        isEmergency: Boolean(dto.project?.isEmergency),
        onlySelectedProfessionalsCanBid: true,
        user: { connect: { id: bookingUser.id } },
      },
      select: { id: true, projectName: true },
    });

    await this.updateProjectLeadState({
      projectId: project.id,
      leadType: 'prospective',
      leadSource: source,
    });
    await this.logProspectiveLeadEvent({
      userId: bookingUser.id,
      projectId: project.id,
      eventType: 'project_partial_created',
      source,
      ipHash,
      uaHash,
      metadata: { tradesCount: tradesRequired.length },
    });

    const assist = await this.createRequest({
      projectId: project.id,
      userId: bookingUser.id,
      raisedBy: 'client',
      category: 'general',
      notes: dto.assist?.notes,
      clientName: `${bookingUser.firstName} ${bookingUser.surname}`.trim(),
      projectName: project.projectName,
      contactMethod: dto.assist?.contactMethod,
      requestedCallAt: dto.assist?.requestedCallAt,
      requestedCallTimezone: dto.assist?.requestedCallTimezone,
      bookingChannel: 'ai_guest_quick',
      leadLifecycleAtBooking: 'prospective',
      consultationDurationMin: 30,
      contactEmailSnapshot: email || null,
      contactMobileSnapshot: mobile || null,
    });

    await this.prisma.$executeRaw`
      UPDATE "User"
      SET "prospectiveBookingCount" = COALESCE("prospectiveBookingCount", 0) + 1,
          "prospectiveLastActivityAt" = NOW()
      WHERE "id" = ${bookingUser.id}
    `;

    await this.logProspectiveLeadEvent({
      userId: bookingUser.id,
      projectId: project.id,
      assistRequestId: assist?.id || null,
      eventType: 'consultation_booking_submitted',
      source,
      ipHash,
      uaHash,
      metadata: {
        contactMethod: dto.assist?.contactMethod || 'chat',
        requestedCallAt: dto.assist?.requestedCallAt || null,
      },
    });

    const guestAckMessage = 'We have got your request for a chat and one of the team will get back to you very shortly.\n\nRegards\nThe Mimo Team';

    if (email) {
      try {
        await this.emailService.sendGuestConsultationAcknowledgement({
          to: email,
          clientName: name,
          projectName,
          message: guestAckMessage,
        });
      } catch (error) {
        console.warn('[AssistRequestsService] Guest consultation acknowledgment email failed:', (error as Error)?.message);
      }
    }

    if (requestedContactMethod === 'whatsapp' && mobile) {
      const outboundMobile = this.normalizeHongKongMobileForOutbound(mobile);
      if (outboundMobile) {
        try {
          await this.notificationService.send({
            phoneNumber: outboundMobile,
            eventType: 'guest_consultation_acknowledged',
            message: guestAckMessage,
            channel: NotificationChannel.WHATSAPP,
          });
        } catch (error) {
          console.warn('[AssistRequestsService] Guest consultation acknowledgment WhatsApp failed:', (error as Error)?.message);
        }
      }
    }

    return {
      projectId: project.id,
      assistRequestId: assist?.id || null,
      caseNumber: (assist as any)?.caseNumber || null,
      prospectiveUserId: bookingUser.id,
      requiresJoin: true,
    };
  }

  async getAiConsultationReport(days = 30) {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 365) : 30;
    const from = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [prospectiveUsersCreated, prospectiveUsersConverted, activeBlocks] = await Promise.all([
      (this.prisma as any).user.count({
        where: {
          lifecycleStatus: 'prospective',
          prospectiveCreatedAt: { gte: from },
        },
      }),
      (this.prisma as any).user.count({
        where: {
          prospectiveConvertedAt: { gte: from },
        },
      }),
      (this.prisma as any).user.count({
        where: {
          prospectiveBlockedUntil: { gt: new Date() },
        },
      }),
    ]);

    const bookings = await (this.prisma as any).projectAssistRequest.findMany({
      where: {
        createdAt: { gte: from },
      },
      select: {
        bookingChannel: true,
        contactMethod: true,
        createdAt: true,
      },
    });

    const bookingsByChannel: Record<string, number> = {};
    const bookingsByMethod: Record<string, number> = {};
    for (const booking of bookings) {
      const channel = booking.bookingChannel || 'unknown';
      bookingsByChannel[channel] = (bookingsByChannel[channel] || 0) + 1;

      const method = booking.contactMethod || 'unknown';
      bookingsByMethod[method] = (bookingsByMethod[method] || 0) + 1;
    }

    const events = await this.prisma.$queryRaw<Array<{ eventType: string; count: bigint }>>`
      SELECT "eventType", COUNT(*)::bigint AS count
      FROM "ProspectiveLeadEvent"
      WHERE "createdAt" >= ${from}
      GROUP BY "eventType"
      ORDER BY COUNT(*) DESC
    `;

    return {
      windowDays: safeDays,
      from,
      prospectiveUsersCreated,
      prospectiveUsersConverted,
      conversionRate:
        prospectiveUsersCreated > 0
          ? Number((prospectiveUsersConverted / prospectiveUsersCreated).toFixed(4))
          : 0,
      activeBlocks,
      totalBookings: bookings.length,
      bookingsByChannel,
      bookingsByMethod,
      eventCounts: events.map((event) => ({
        eventType: event.eventType,
        count: Number(event.count),
      })),
    };
  }

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private realtime: RealtimeService,
  ) {}

  /**
   * Generate a case number and create a Case row, then backlink the AssistRequest.
   * Case number format: FOH-YYYY-NNNNN (uses DB sequence function)
   */
  private async createCaseForAssist(params: {
    assistRequestId: string;
    projectId: string;
    category: string;
    raisedBy: string;
    clientUserId?: string | null;
    professionalId?: string | null;
    title?: string;
  }): Promise<{ caseId: string; caseNumber: string }> {
    // Use the DB function to get the next case number
    const seqResult = await this.prisma.$queryRaw<[{ next_case_number: string }]>`
      SELECT next_case_number() AS next_case_number
    `;
    const caseNumber = seqResult[0]?.next_case_number;
    if (!caseNumber) throw new Error('Failed to generate case number');

    const slaDeadline = new Date(Date.now() + 60 * 60 * 1000); // +1 hour

    const created = await (this.prisma as any).case.create({
      data: {
        caseNumber,
        title: params.title || null,
        category: params.category,
        status: 'open',
        priority: params.category === 'safety' ? 'urgent' : params.category === 'dispute' ? 'high' : 'normal',
        raisedBy: params.raisedBy,
        projectId: params.projectId,
        clientUserId: params.clientUserId || null,
        professionalId: params.professionalId || null,
        assistRequestId: params.assistRequestId,
        slaDeadline,
      },
    } as any);

    // Write caseId back to the assist request
    await (this.prisma as any).projectAssistRequest.update({
      where: { id: params.assistRequestId },
      data: { caseId: created.id },
    });

    return { caseId: created.id, caseNumber };
  }

  async createRequest(dto: CreateAssistRequestDto) {
    if (!dto.projectId) throw new BadRequestException('projectId is required');

    const contactMethod = dto.contactMethod || 'chat';
    if (!['chat', 'call', 'whatsapp'].includes(contactMethod)) {
      throw new BadRequestException('Invalid contactMethod');
    }

    let requestedCallAt: Date | null = null;
    if (dto.requestedCallAt) {
      requestedCallAt = new Date(dto.requestedCallAt);
      if (Number.isNaN(requestedCallAt.getTime())) {
        throw new BadRequestException('Invalid requestedCallAt');
      }
    }

    if (contactMethod === 'call' && !requestedCallAt) {
      throw new BadRequestException('requestedCallAt is required for call requests');
    }

    const project = await (this.prisma as any).project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const projectUserId = dto.userId || project.userId || undefined;
    const requestUser = projectUserId
      ? await this.prisma.user.findUnique({
          where: { id: projectUserId },
          select: {
            id: true,
            firstName: true,
            surname: true,
            email: true,
            mobile: true,
          },
        })
      : null;

    const existing = await (this.prisma as any).projectAssistRequest.findFirst({
      where: { projectId: dto.projectId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      try {
        await this.mirrorToSupportPool({
          projectId: dto.projectId,
          contactMethod,
          requestedCallAt,
          requestedCallTimezone: dto.requestedCallTimezone,
          notes: dto.notes,
          clientName:
            dto.clientName ||
            [requestUser?.firstName, requestUser?.surname].filter(Boolean).join(' ').trim() ||
            project.clientName ||
            undefined,
          clientEmail: requestUser?.email || undefined,
          phone: requestUser?.mobile || undefined,
        });
      } catch (err) {
        console.warn('[AssistRequestsService] Support pool mirror failed (existing assist):', err);
      }
      return existing;
    }

    const created = await (this.prisma as any).projectAssistRequest.create({
      data: {
        projectId: dto.projectId,
        userId: dto.userId || null,
        professionalId: dto.professionalId || null,
        raisedBy: dto.raisedBy || (dto.professionalId ? 'professional' : 'client'),
        category: dto.category || 'general',
        status: 'open',
        contactMethod,
        requestedCallAt,
        requestedCallTimezone: dto.requestedCallTimezone || (requestedCallAt ? 'Asia/Hong_Kong' : null),
        notes: dto.notes?.trim() || null,
      },
    });

    await this.updateAssistBookingMetadata({
      assistRequestId: created.id,
      bookingChannel: dto.bookingChannel,
      leadLifecycleAtBooking: dto.leadLifecycleAtBooking,
      consultationDurationMin: dto.consultationDurationMin,
      contactEmailSnapshot: dto.contactEmailSnapshot || requestUser?.email || null,
      contactMobileSnapshot: dto.contactMobileSnapshot || requestUser?.mobile || null,
    });

    await this.logProspectiveLeadEvent({
      userId: dto.userId || project.userId || null,
      projectId: dto.projectId,
      assistRequestId: created.id,
      eventType: 'assist_request_created',
      source: dto.bookingChannel || 'app',
      metadata: {
        contactMethod,
        lifecycleAtBooking: dto.leadLifecycleAtBooking || null,
      },
    });

    // Auto-create a Case and link it
    let caseNumber: string | null = null;
    try {
      const caseResult = await this.createCaseForAssist({
        assistRequestId: created.id,
        projectId: dto.projectId,
        category: dto.category || 'general',
        raisedBy: dto.raisedBy || (dto.professionalId ? 'professional' : 'client'),
        clientUserId: dto.userId || null,
        professionalId: dto.professionalId || null,
        title: dto.projectName ? `${dto.projectName} – ${dto.category || 'general'}` : undefined,
      });
      caseNumber = caseResult.caseNumber;
      created.caseNumber = caseNumber; // attach to returned object
    } catch (err) {
      console.warn('[AssistRequestsService] Case creation failed (non-fatal):', err);
    }

    // Seed an initial message so FOH has context
    if (dto.notes?.trim()) {
      await (this.prisma as any).assistMessage.create({
        data: {
          assistRequestId: created.id,
          senderType: 'client',
          senderUserId: dto.userId || null,
          content: dto.notes.trim(),
        },
      });

      void this.realtime.emitToAdmins({
        type: 'admin.feed.changed',
        payload: {
          sourceType: 'assist',
          sourceId: created.id,
        },
      });
      void this.realtime.emitToAdmins({
        type: 'assist.message.created',
        payload: {
          sourceType: 'assist',
          sourceId: created.id,
          projectId: created.projectId,
          sender: 'client',
        },
      });
      if (created.userId) {
        this.realtime.emitToUser(created.userId, {
          type: 'assist.message.created',
          payload: {
            sourceType: 'assist',
            sourceId: created.id,
            projectId: created.projectId,
            sender: 'client',
          },
        });
      }
    }

    try {
      await this.mirrorToSupportPool({
        projectId: dto.projectId,
        contactMethod,
        requestedCallAt,
        requestedCallTimezone: dto.requestedCallTimezone,
        notes: dto.notes,
        clientName:
          dto.clientName ||
          [requestUser?.firstName, requestUser?.surname].filter(Boolean).join(' ').trim() ||
          project.clientName ||
          undefined,
        clientEmail: requestUser?.email || undefined,
        phone: requestUser?.mobile || undefined,
      });
    } catch (err) {
      console.warn('[AssistRequestsService] Support pool mirror failed (new assist):', err);
    }

    // Notify FOH via email
    try {
      const methodLabel =
        contactMethod === 'call'
          ? 'Book a call'
          : contactMethod === 'whatsapp'
            ? 'Please WhatsApp me'
            : 'In-platform chat';

      const formattedRequestedCallAt = requestedCallAt
        ? requestedCallAt.toLocaleString('en-GB', {
            timeZone: 'Asia/Hong_Kong',
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;

      const notificationNotes = [
        `Assistance type: ${methodLabel}`,
        formattedRequestedCallAt ? `Requested call slot: ${formattedRequestedCallAt} (Hong Kong)` : null,
        dto.notes?.trim() ? `\nClient request:\n${dto.notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      await this.emailService.sendAssistRequestNotification({
        to: process.env.FOH_ASSIST_EMAIL || 'fitouthub@romski.me.uk',
        projectName: dto.projectName || project.projectName || 'Project',
        projectId: dto.projectId,
        clientName: dto.clientName || project.clientName || 'Client',
        notes: notificationNotes,
        webBaseUrl:
          process.env.WEB_BASE_URL ||
          process.env.FRONTEND_BASE_URL ||
          process.env.APP_WEB_URL ||
          'https://fitouthub-web.vercel.app',
      });
    } catch (err) {
      console.warn('[AssistRequestsService] Email send failed:', err);
    }

    return created;
  }

  async list(params?: { status?: string; limit?: number; offset?: number }) {
    await this.finalizeExpiredClosures();
    const { status, limit = 50, offset = 0 } = params || {};
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      (this.prisma as any).projectAssistRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
        skip: Math.max(offset, 0),
        include: {
          project: {
            select: {
              id: true,
              projectName: true,
              status: true,
              region: true,
              clientName: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              surname: true,
              email: true,
            },
          },
          case: {
            select: {
              id: true,
              caseNumber: true,
              category: true,
              status: true,
              raisedBy: true,
              slaDeadline: true,
              firstRepliedAt: true,
              slaBreachedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      (this.prisma as any).projectAssistRequest.count({ where }),
    ]);

    return { items, total };
  }

  async addMessage(
    assistRequestId: string,
    sender: 'client' | 'foh',
    content: string,
    senderUserId?: string,
  ) {
    if (!assistRequestId)
      throw new BadRequestException('assistRequestId is required');
    if (!content || !content.trim())
      throw new BadRequestException('content is required');

    const assist = await (this.prisma as any).projectAssistRequest.findUnique({
      where: { id: assistRequestId },
      select: { id: true, status: true, statusTimeline: true, userId: true, projectId: true, caseId: true },
    });
    if (!assist) throw new BadRequestException('Assist request not found');

    const message = await (this.prisma as any).assistMessage.create({
      data: {
        assistRequestId,
        senderType: sender,
        senderUserId: senderUserId || null,
        content: content.trim(),
      },
    });

    if (sender === 'foh' && assist.caseId) {
      const linkedCase = await (this.prisma as any).case.findUnique({
        where: { id: assist.caseId },
        select: {
          id: true,
          status: true,
          slaDeadline: true,
          firstRepliedAt: true,
          slaBreachedAt: true,
        },
      });

      if (linkedCase && !linkedCase.firstRepliedAt) {
        const now = new Date();
        await (this.prisma as any).case.update({
          where: { id: linkedCase.id },
          data: {
            firstRepliedAt: now,
            slaBreachedAt:
              linkedCase.slaDeadline && now.getTime() > new Date(linkedCase.slaDeadline).getTime()
                ? linkedCase.slaBreachedAt || now
                : linkedCase.slaBreachedAt || null,
            status: linkedCase.status === 'open' ? 'in_progress' : linkedCase.status,
          },
        });
      }
    }

    if (assist.status === 'closure_pending' || assist.status === 'closed') {
      await (this.prisma as any).projectAssistRequest.update({
        where: { id: assistRequestId },
        data: {
          status: 'in_progress',
          reopenedAt: new Date(),
          closureRequestedAt: null,
          closureDueAt: null,
          statusTimeline: this.appendTimelineEvent(assist.statusTimeline, {
            action: 'reopened_by_message',
            status: 'in_progress',
            actorId: senderUserId || null,
          }),
        },
      });
      void this.realtime.emitToAdmins({
        type: 'thread.status.changed',
        payload: {
          sourceType: 'assist',
          sourceId: assistRequestId,
          status: 'in_progress',
          reason: 'reopened_by_message',
        },
      });
      void this.realtime.emitToAdmins({
        type: 'admin.feed.changed',
        payload: {
          sourceType: 'assist',
          sourceId: assistRequestId,
        },
      });
    }

    const event = {
      type: 'assist.message.created',
      payload: {
        sourceType: 'assist',
        sourceId: assistRequestId,
        projectId: assist.projectId,
        sender,
      },
    };
    void this.realtime.emitToAdmins({
      type: 'admin.feed.changed',
      payload: {
        sourceType: 'assist',
        sourceId: assistRequestId,
      },
    });
    void this.realtime.emitToAdmins(event);
    if (assist.userId) {
      this.realtime.emitToUser(assist.userId, event);
    }

    return message;
  }

  async getMessages(
    assistRequestId: string,
    limit = 50,
    offset = 0,
    fromLatest = false,
  ) {
    await this.finalizeExpiredClosures();
    if (!assistRequestId)
      throw new BadRequestException('assistRequestId is required');

    if (fromLatest) {
      const safeLimit = Math.min(Math.max(limit, 1), 200);
      const safeOffset = Math.max(offset, 0);
      const total = await (this.prisma as any).assistMessage.count({
        where: { assistRequestId },
      });
      const messagesDesc = await (this.prisma as any).assistMessage.findMany({
        where: { assistRequestId },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
      });

      return {
        messages: [...messagesDesc].reverse(),
        total,
        hasMore: total > safeOffset + messagesDesc.length,
        offset: safeOffset,
        limit: safeLimit,
      };
    }

    const messages = await (this.prisma as any).assistMessage.findMany({
      where: { assistRequestId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
      skip: Math.max(offset, 0),
    });
    return messages;
  }

  async getLatestByProject(projectId: string) {
    await this.finalizeExpiredClosures();
    if (!projectId) throw new BadRequestException('projectId is required');
    const assist = await (this.prisma as any).projectAssistRequest.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            region: true,
            clientName: true,
            status: true,
          },
        },
        user: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
      },
    });
    return assist || null;
  }

  async listByProject(projectId: string, limit = 100) {
    await this.finalizeExpiredClosures();
    if (!projectId) throw new BadRequestException('projectId is required');

    const assists = await (this.prisma as any).projectAssistRequest.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            status: true,
            category: true,
            raisedBy: true,
            slaDeadline: true,
            firstRepliedAt: true,
            resolvedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return assists;
  }

  async updateStatus(
    id: string,
    status: 'open' | 'in_progress' | 'closed' | 'closure_pending',
    options?: {
      actorId?: string;
      resolutionReason?: string;
      resolutionMode?: 'user_confirmed' | 'sla_timeout';
    },
  ) {
    if (!id) throw new BadRequestException('id is required');
    if (!['open', 'in_progress', 'closed', 'closure_pending'].includes(status))
      throw new BadRequestException('invalid status');

    const assist = await (this.prisma as any).projectAssistRequest.findUnique({
      where: { id },
      include: { project: { select: { isEmergency: true } } },
    });
    if (!assist) throw new BadRequestException('Assist request not found');

    if (status === 'closure_pending') {
      const now = new Date();
      const isEmergency = Boolean(assist.project?.isEmergency);
      const dueAt = new Date(now.getTime() + (isEmergency ? this.emergencyCloseMs : this.defaultCloseMs));
      const resolutionReason = options?.resolutionReason || 'Admin requested closure';
      const updated = await (this.prisma as any).projectAssistRequest.update({
        where: { id },
        data: {
          status,
          closureRequestedAt: now,
          closureDueAt: dueAt,
          resolvedBy: options?.actorId || null,
          resolutionReason,
          resolutionMode: options?.resolutionMode || 'user_confirmed',
          statusTimeline: this.appendTimelineEvent(assist.statusTimeline, {
            action: 'closure_requested',
            status,
            actorId: options?.actorId || null,
            reason: resolutionReason,
            mode: options?.resolutionMode || 'user_confirmed',
            metadata: {
              dueAt: dueAt.toISOString(),
              emergency: isEmergency,
            },
          }),
        },
      });

      const closureMessage = await (this.prisma as any).assistMessage.create({
        data: {
          assistRequestId: id,
          senderType: 'foh',
          senderUserId: options?.actorId || null,
          content: this.formatClosureNotice(dueAt, resolutionReason),
        },
      });

      const messageEvent = {
        type: 'assist.message.created',
        payload: {
          sourceType: 'assist',
          sourceId: id,
          projectId: assist.projectId,
          sender: 'foh',
          message: closureMessage,
        },
      };

      void this.realtime.emitToAdmins({
        type: 'thread.status.changed',
        payload: {
          sourceType: 'assist',
          sourceId: id,
          status: 'closure_pending',
        },
      });
      void this.realtime.emitToAdmins({
        type: 'admin.feed.changed',
        payload: {
          sourceType: 'assist',
          sourceId: id,
        },
      });
      void this.realtime.emitToAdmins(messageEvent);
      if (assist.userId) {
        this.realtime.emitToUser(assist.userId, messageEvent);
        this.realtime.emitToUser(assist.userId, {
          type: 'thread.status.changed',
          payload: {
            sourceType: 'assist',
            sourceId: id,
            status: 'closure_pending',
          },
        });
      }
      return updated;
    }

    const updated = await (this.prisma as any).projectAssistRequest.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'closed' ? new Date() : null,
        reopenedAt: status === 'open' || status === 'in_progress' ? new Date() : assist.reopenedAt,
        closureRequestedAt: status === 'open' || status === 'in_progress' ? null : assist.closureRequestedAt,
        closureDueAt: status === 'open' || status === 'in_progress' ? null : assist.closureDueAt,
        statusTimeline: this.appendTimelineEvent(assist.statusTimeline, {
          action: status === 'closed' ? 'resolved' : 'status_updated',
          status,
          actorId: options?.actorId || null,
          reason: options?.resolutionReason || null,
          mode: options?.resolutionMode || null,
        }),
      },
    });

    void this.realtime.emitToAdmins({
      type: 'thread.status.changed',
      payload: {
        sourceType: 'assist',
        sourceId: id,
        status,
      },
    });
    void this.realtime.emitToAdmins({
      type: 'admin.feed.changed',
      payload: {
        sourceType: 'assist',
        sourceId: id,
      },
    });
    if (assist.userId) {
      this.realtime.emitToUser(assist.userId, {
        type: 'thread.status.changed',
        payload: {
          sourceType: 'assist',
          sourceId: id,
          status,
        },
      });
    }
    return updated;
  }
}
