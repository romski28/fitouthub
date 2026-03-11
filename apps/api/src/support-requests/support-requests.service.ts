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

@Injectable()
export class SupportRequestsService {
  private readonly logger = new Logger(SupportRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioProvider,
  ) {}

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

  // ── Pool queries ─────────────────────────────────────────────────────────

  /** Return all non-resolved requests for the admin pool view */
  async getPool() {
    try {
      return await this.prisma.supportRequest.findMany({
        where: { status: { not: 'resolved' } },
        include: {
          assignedAdmin: {
            select: { id: true, firstName: true, surname: true },
          },
          project: { select: { id: true, projectName: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }
  }

  /** Return resolved requests (paginated) */
  async getResolved(limit = 50, offset = 0) {
    try {
      return await this.prisma.supportRequest.findMany({
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
    let req;

    try {
      req = await this.prisma.supportRequest.findUnique({
        where: { id },
        include: {
          assignedAdmin: {
            select: { id: true, firstName: true, surname: true },
          },
          project: { select: { id: true, projectName: true } },
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
    return this.prisma.supportRequest.update({
      where: { id },
      data: {
        status: 'claimed',
        assignedAdminId: adminId,
        claimedAt: new Date(),
      },
    });
  }

  async release(id: string, adminId: string) {
    const req = await this.getOne(id);
    if (req.assignedAdminId !== adminId) {
      throw new ForbiddenException(
        'You can only release requests you have claimed',
      );
    }
    return this.prisma.supportRequest.update({
      where: { id },
      data: {
        status: 'unassigned',
        assignedAdminId: null,
        claimedAt: null,
      },
    });
  }

  async markInProgress(id: string, adminId: string) {
    const req = await this.getOne(id);
    if (req.assignedAdminId !== adminId) {
      throw new ForbiddenException(
        'Only the assigned admin can update this request',
      );
    }
    return this.prisma.supportRequest.update({
      where: { id },
      data: { status: 'in_progress' },
    });
  }

  async resolve(id: string, adminId: string) {
    const req = await this.getOne(id);
    if (req.assignedAdminId && req.assignedAdminId !== adminId) {
      throw new ForbiddenException(
        'Only the assigned admin can resolve this request',
      );
    }
    return this.prisma.supportRequest.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
      },
    });
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

    return this.prisma.supportRequest.update({
      where: { id },
      data: {
        replies: [...existingReplies, newReply] as any,
        status: req.status === 'claimed' ? 'in_progress' : req.status,
      },
    });
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
      existing = await this.prisma.supportRequest.findFirst({
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
        await this.prisma.supportRequest.update({
          where: { id: existing.id },
          data: { replies: [...existingReplies, inboundEntry] as any },
        });
      } catch (error) {
        this.rethrowSupportPoolDatabaseError(error);
      }
      this.logger.log(
        `Appended message to existing support request ${existing.id}`,
      );
      return existing;
    }

    // New conversation
    let req;

    try {
      req = await this.prisma.supportRequest.create({
        data: {
          channel: 'whatsapp',
          fromNumber,
          clientName: payload.ProfileName ?? null,
          body: payload.Body ?? '',
          twilioMessageSid: payload.MessageSid ?? null,
          status: 'unassigned',
          replies: [],
        },
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }

    this.logger.log(`Created new support request ${req.id} from ${fromNumber}`);
    return req;
  }

  /** Create a SupportRequest from the website callback form */
  async createCallback(dto: CreateCallbackDto) {
    try {
      return await this.prisma.supportRequest.create({
        data: {
          channel: 'callback',
          fromNumber: dto.phone ?? null,
          clientName: dto.clientName,
          clientEmail: dto.clientEmail ?? null,
          body: dto.notes ?? 'Callback requested',
          projectId: dto.projectId ?? null,
          status: 'unassigned',
          replies: [],
        },
      });
    } catch (error) {
      this.rethrowSupportPoolDatabaseError(error);
    }
  }
}
