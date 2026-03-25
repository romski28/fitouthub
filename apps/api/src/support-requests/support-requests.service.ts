import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { TwilioProvider } from '../notifications/twilio.provider';
import { WhatsAppInboundDto } from './dto/whatsapp-inbound.dto';
import { CreateCallbackDto } from './dto/support-request.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class SupportRequestsService {
  private readonly logger = new Logger(SupportRequestsService.name);
  private readonly emergencyCloseMs = 60 * 60 * 1000;
  private readonly defaultCloseMs = 12 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioProvider,
    private readonly realtime: RealtimeService,
  ) {}

  private emitAdminFeedChanged(sourceId?: string) {
    void this.realtime.emitToAdmins({
      type: 'admin.feed.changed',
      payload: {
        sourceType: 'support',
        sourceId,
      },
    });
  }

  private rethrowSupportPoolDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      throw new ServiceUnavailableException(
        'Support pool database migration has not been applied yet',
      );
    }

    throw error;
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
    const expiring = await (this.prisma as any).supportRequest.findMany({
      where: {
        status: 'closure_pending',
        closureDueAt: { lte: now },
      },
      select: {
        id: true,
        statusTimeline: true,
      },
      take: 200,
    });

    if (!expiring.length) return;

    await Promise.all(
      expiring.map((item: any) =>
        (this.prisma as any).supportRequest.update({
          where: { id: item.id },
          data: {
            status: 'resolved',
            resolvedAt: now,
            resolutionMode: 'sla_timeout',
            resolutionReason: 'SLA timeout after closure request',
            statusTimeline: this.appendTimelineEvent(item.statusTimeline, {
              action: 'auto_resolved',
              status: 'resolved',
              mode: 'sla_timeout',
              reason: 'SLA timeout after closure request',
            }),
          },
        }),
      ),
    );
  }

  // ── Pool queries ─────────────────────────────────────────────────────────

  /** Return all non-resolved requests for the admin pool view */
  async getPool() {
    await this.finalizeExpiredClosures();
    try {
      return await (this.prisma as any).supportRequest.findMany({
        where: { status: { not: 'resolved' } },
        include: {
          assignedAdmin: {
            select: { id: true, firstName: true, surname: true },
          },
          project: { select: { id: true, projectName: true, isEmergency: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }
  }

  /** Return resolved requests (paginated) */
  async getResolved(limit = 50, offset = 0) {
    await this.finalizeExpiredClosures();
    try {
      return await (this.prisma as any).supportRequest.findMany({
        where: { status: 'resolved' },
        include: {
          assignedAdmin: {
            select: { id: true, firstName: true, surname: true },
          },
          project: { select: { id: true, projectName: true } },
        },
        orderBy: { resolvedAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }
  }

  /** Return a single request */
  async getOne(id: string) {
    await this.finalizeExpiredClosures();
    let req;

    try {
      req = await (this.prisma as any).supportRequest.findUnique({
        where: { id },
        include: {
          assignedAdmin: {
            select: { id: true, firstName: true, surname: true },
          },
          project: { select: { id: true, projectName: true, isEmergency: true } },
        },
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }

    if (!req) throw new NotFoundException('Support request not found');
    return req;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async claim(id: string, adminId: string) {
    const req = await this.getOne(id);
    if (req.status !== 'unassigned') {
      throw new BadRequestException(
        `Cannot claim a request with status "${req.status}"`,
      );
    }
    const updated = await (this.prisma as any).supportRequest.update({
      where: { id },
      data: {
        status: 'claimed',
        assignedAdminId: adminId,
        claimedAt: new Date(),
        statusTimeline: this.appendTimelineEvent(req.statusTimeline, {
          action: 'claimed',
          status: 'claimed',
          actorId: adminId,
        }),
      },
    });

    this.emitAdminFeedChanged(id);
    void this.realtime.emitToAdmins({
      type: 'thread.status.changed',
      payload: {
        sourceType: 'support',
        sourceId: id,
        status: 'claimed',
      },
    });
    return updated;
  }

  async release(id: string, adminId: string) {
    const req = await this.getOne(id);
    if (req.assignedAdminId !== adminId) {
      throw new ForbiddenException(
        'You can only release requests you have claimed',
      );
    }
    const updated = await (this.prisma as any).supportRequest.update({
      where: { id },
      data: {
        status: 'unassigned',
        assignedAdminId: null,
        claimedAt: null,
        statusTimeline: this.appendTimelineEvent(req.statusTimeline, {
          action: 'released',
          status: 'unassigned',
          actorId: adminId,
        }),
      },
    });

    this.emitAdminFeedChanged(id);
    void this.realtime.emitToAdmins({
      type: 'thread.status.changed',
      payload: {
        sourceType: 'support',
        sourceId: id,
        status: 'unassigned',
      },
    });
    return updated;
  }

  async markInProgress(id: string, adminId: string) {
    const req = await this.getOne(id);
    if (req.assignedAdminId !== adminId) {
      throw new ForbiddenException(
        'Only the assigned admin can update this request',
      );
    }
    const updated = await (this.prisma as any).supportRequest.update({
      where: { id },
      data: {
        status: 'in_progress',
        statusTimeline: this.appendTimelineEvent(req.statusTimeline, {
          action: 'marked_in_progress',
          status: 'in_progress',
          actorId: adminId,
        }),
      },
    });

    this.emitAdminFeedChanged(id);
    void this.realtime.emitToAdmins({
      type: 'thread.status.changed',
      payload: {
        sourceType: 'support',
        sourceId: id,
        status: 'in_progress',
      },
    });
    return updated;
  }

  async resolve(
    id: string,
    adminId: string,
    options?: {
      resolutionReason?: string;
      resolutionMode?: 'user_confirmed' | 'sla_timeout';
    },
  ) {
    const req = await this.getOne(id);
    if (req.assignedAdminId && req.assignedAdminId !== adminId) {
      throw new ForbiddenException(
        'Only the assigned admin can resolve this request',
      );
    }

    const now = new Date();
    const isEmergency = Boolean(req.project?.isEmergency);
    const dueAt = new Date(now.getTime() + (isEmergency ? this.emergencyCloseMs : this.defaultCloseMs));
    const resolutionReason = options?.resolutionReason || 'Admin requested closure';
    const resolutionMode = options?.resolutionMode || 'user_confirmed';

    const updated = await (this.prisma as any).supportRequest.update({
      where: { id },
      data: {
        status: 'closure_pending',
        closureRequestedAt: now,
        closureDueAt: dueAt,
        resolvedBy: adminId,
        resolutionReason,
        resolutionMode,
        statusTimeline: this.appendTimelineEvent(req.statusTimeline, {
          action: 'closure_requested',
          status: 'closure_pending',
          actorId: adminId,
          reason: resolutionReason,
          mode: resolutionMode,
          metadata: {
            dueAt: dueAt.toISOString(),
            emergency: isEmergency,
          },
        }),
      },
    });

    this.emitAdminFeedChanged(id);
    void this.realtime.emitToAdmins({
      type: 'thread.status.changed',
      payload: {
        sourceType: 'support',
        sourceId: id,
        status: 'closure_pending',
      },
    });
    return updated;
  }

  async updateNotes(id: string, adminId: string, notes: string) {
    await this.getOne(id);
    return this.prisma.supportRequest.update({
      where: { id },
      data: { notes },
    });
  }

  async linkProject(id: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.prisma.supportRequest.update({
      where: { id },
      data: { projectId },
    });
  }

  // ── Reply ─────────────────────────────────────────────────────────────────

  async sendReply(id: string, adminId: string, message: string) {
    const req = await this.getOne(id);

    if (req.channel === 'whatsapp') {
      if (!req.fromNumber) {
        throw new BadRequestException(
          'No phone number on this request to reply to',
        );
      }
      const result = await this.twilio.sendWhatsApp(req.fromNumber, message);
      if (!result.success) {
        this.logger.error(
          `WhatsApp reply failed for support request ${id}:`,
          result.error,
        );
      }
    } else {
      // callback — no outbound message, just log the reply internally
      this.logger.log(
        `[SupportRequest ${id}] Callback reply recorded by admin ${adminId}`,
      );
    }

    // Append to replies journal
    const existingReplies = Array.isArray(req.replies) ? req.replies : [];
    const newReply = {
      body: message,
      sentAt: new Date().toISOString(),
      adminId,
      direction: 'outbound',
    };

    const updated = await (this.prisma as any).supportRequest.update({
      where: { id },
      data: {
        replies: [...existingReplies, newReply] as any,
        status:
          req.status === 'closure_pending'
            ? 'in_progress'
            : req.status === 'claimed'
              ? 'in_progress'
              : req.status,
        reopenedAt: req.status === 'closure_pending' ? new Date() : req.reopenedAt,
        closureRequestedAt: req.status === 'closure_pending' ? null : req.closureRequestedAt,
        closureDueAt: req.status === 'closure_pending' ? null : req.closureDueAt,
        statusTimeline:
          req.status === 'closure_pending'
            ? this.appendTimelineEvent(req.statusTimeline, {
                action: 'reopened_by_admin_reply',
                status: 'in_progress',
                actorId: adminId,
              })
            : req.statusTimeline,
      },
    });

    this.emitAdminFeedChanged(id);
    void this.realtime.emitToAdmins({
      type: 'support.message.created',
      payload: {
        sourceType: 'support',
        sourceId: id,
        direction: 'outbound',
      },
    });
    if (req.status === 'closure_pending') {
      void this.realtime.emitToAdmins({
        type: 'thread.status.changed',
        payload: {
          sourceType: 'support',
          sourceId: id,
          status: 'in_progress',
          reason: 'reopened_by_admin_reply',
        },
      });
    }
    return updated;
  }

  // ── Inbound creation ──────────────────────────────────────────────────────

  /** Create a SupportRequest from a Twilio inbound WhatsApp webhook payload */
  async createFromWhatsapp(payload: WhatsAppInboundDto) {
    const fromRaw = payload.From ?? '';
    // Strip 'whatsapp:' prefix if present
    const fromNumber = fromRaw.replace(/^whatsapp:/i, '');

    this.logger.log(
      `Inbound WhatsApp from ${fromNumber}: "${payload.Body?.substring(0, 60)}"`,
    );

    // Check if there is already an open (non-resolved) request from this number
    let existing;

    try {
      existing = await (this.prisma as any).supportRequest.findFirst({
        where: {
          fromNumber,
          channel: 'whatsapp',
          status: { not: 'resolved' },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }

    if (existing) {
      // Append the new message as an inbound reply to the existing thread
      const existingReplies = Array.isArray(existing.replies)
        ? existing.replies
        : [];
      const inboundEntry = {
        body: payload.Body,
        sentAt: new Date().toISOString(),
        direction: 'inbound',
        twilioMessageSid: payload.MessageSid,
      };
      try {
        await (this.prisma as any).supportRequest.update({
          where: { id: existing.id },
          data: {
            replies: [...existingReplies, inboundEntry] as any,
            status: existing.status === 'closure_pending' ? 'in_progress' : existing.status,
            reopenedAt: existing.status === 'closure_pending' ? new Date() : existing.reopenedAt,
            closureRequestedAt: existing.status === 'closure_pending' ? null : existing.closureRequestedAt,
            closureDueAt: existing.status === 'closure_pending' ? null : existing.closureDueAt,
            statusTimeline:
              existing.status === 'closure_pending'
                ? this.appendTimelineEvent(existing.statusTimeline, {
                    action: 'reopened_by_inbound',
                    status: 'in_progress',
                  })
                : existing.statusTimeline,
          },
        });
      } catch (error) {
        this.rethrowSupportPoolDatabaseError(error);
      }
      this.logger.log(
        `Appended message to existing support request ${existing.id}`,
      );
      this.emitAdminFeedChanged(existing.id);
      void this.realtime.emitToAdmins({
        type: 'support.message.created',
        payload: {
          sourceType: 'support',
          sourceId: existing.id,
          direction: 'inbound',
        },
      });
      return existing;
    }

    // New conversation
    let req;

    try {
      req = await (this.prisma as any).supportRequest.create({
        data: {
          channel: 'whatsapp',
          fromNumber,
          clientName: payload.ProfileName ?? null,
          body: payload.Body ?? '',
          twilioMessageSid: payload.MessageSid ?? null,
          status: 'unassigned',
          replies: [],
          statusTimeline: this.appendTimelineEvent([], {
            action: 'created',
            status: 'unassigned',
          }),
        },
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }

    this.logger.log(`Created new support request ${req.id} from ${fromNumber}`);
    this.emitAdminFeedChanged(req.id);
    void this.realtime.emitToAdmins({
      type: 'support.message.created',
      payload: {
        sourceType: 'support',
        sourceId: req.id,
        direction: 'inbound',
      },
    });
    return req;
  }

  /** Create a SupportRequest from the website callback form */
  async createCallback(dto: CreateCallbackDto) {
    try {
      const created = await (this.prisma as any).supportRequest.create({
        data: {
          channel: 'callback',
          fromNumber: dto.phone ?? null,
          clientName: dto.clientName,
          clientEmail: dto.clientEmail ?? null,
          body: dto.notes ?? 'Callback requested',
          projectId: dto.projectId ?? null,
          status: 'unassigned',
          replies: [],
          statusTimeline: this.appendTimelineEvent([], {
            action: 'created',
            status: 'unassigned',
          }),
        },
      });
      this.emitAdminFeedChanged(created.id);
      return created;
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }
  }
}
