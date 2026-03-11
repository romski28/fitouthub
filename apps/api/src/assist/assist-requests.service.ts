import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';

interface CreateAssistRequestDto {
  projectId: string;
  userId?: string;
  notes?: string;
  clientName?: string;
  projectName?: string;
  contactMethod?: 'chat' | 'call' | 'whatsapp';
  requestedCallAt?: string;
  requestedCallTimezone?: string;
}

@Injectable()
export class AssistRequestsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

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

    const existing = await (this.prisma as any).projectAssistRequest.findFirst({
      where: { projectId: dto.projectId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    const created = await (this.prisma as any).projectAssistRequest.create({
      data: {
        projectId: dto.projectId,
        userId: dto.userId,
        status: 'open',
        contactMethod,
        requestedCallAt,
        requestedCallTimezone: dto.requestedCallTimezone || (requestedCallAt ? 'Asia/Hong_Kong' : null),
        notes: dto.notes?.trim() || null,
      },
    });

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

    return message;
  }

  async getMessages(assistRequestId: string, limit = 50, offset = 0) {
    if (!assistRequestId)
      throw new BadRequestException('assistRequestId is required');
    const messages = await (this.prisma as any).assistMessage.findMany({
      where: { assistRequestId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
      skip: Math.max(offset, 0),
    });
    return messages;
  }

  async getLatestByProject(projectId: string) {
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

  async updateStatus(id: string, status: 'open' | 'in_progress' | 'closed') {
    if (!id) throw new BadRequestException('id is required');
    if (!['open', 'in_progress', 'closed'].includes(status))
      throw new BadRequestException('invalid status');
    return this.prisma.projectAssistRequest.update({
      where: { id },
      data: { status },
    });
  }
}
