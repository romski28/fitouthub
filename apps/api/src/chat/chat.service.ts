import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PrivateChatThreadDto, PrivateChatMessageDto } from './dto/private-chat.dto';
import { AnonymousChatThreadDto, AnonymousChatMessageDto } from './dto/anonymous-chat.dto';
import { ProjectChatThreadDto, ProjectChatMessageDto } from './dto/project-chat.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ChatService {
  private readonly emergencyCloseMs = 60 * 60 * 1000;
  private readonly defaultCloseMs = 12 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

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

  private normalizePage(limit?: number, offset?: number) {
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Number(limit), 1), 100)
      : undefined;
    const safeOffset = Number.isFinite(offset)
      ? Math.max(Number(offset), 0)
      : 0;

    return { safeLimit, safeOffset };
  }

  private filterPrivateMessagesForContext(messages: any[], scopedProjectId: string | null) {
    if (!Array.isArray(messages)) return [];
    if (scopedProjectId) {
      return messages.filter((message) => {
        const pageType = String((message as any)?.context?.pageType || '');
        const projectId = (message as any)?.context?.projectId;
        return pageType === 'project_view' && String(projectId || '') === String(scopedProjectId);
      });
    }

    return messages.filter((message) => {
      const pageType = String((message as any)?.context?.pageType || '');
      return pageType !== 'project_view';
    });
  }

  private async getPagedPrivateMessages(threadId: string, limit?: number, offset?: number) {
    const { safeLimit, safeOffset } = this.normalizePage(limit, offset);
    const total = await this.prisma.privateChatMessage.count({ where: { threadId } });

    if (!safeLimit) {
      const messages = await this.prisma.privateChatMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
      });
      return { messages, total, hasMoreMessages: false, messagePageOffset: 0, messagePageLimit: total };
    }

    const messagesDesc = await this.prisma.privateChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      skip: safeOffset,
      take: safeLimit,
    });

    return {
      messages: [...messagesDesc].reverse(),
      total,
      hasMoreMessages: total > safeOffset + messagesDesc.length,
      messagePageOffset: safeOffset,
      messagePageLimit: safeLimit,
    };
  }

  private async getPagedAnonymousMessages(threadId: string, limit?: number, offset?: number) {
    const { safeLimit, safeOffset } = this.normalizePage(limit, offset);
    const total = await this.prisma.anonymousChatMessage.count({ where: { threadId } });

    if (!safeLimit) {
      const messages = await this.prisma.anonymousChatMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
      });
      return { messages, total, hasMoreMessages: false, messagePageOffset: 0, messagePageLimit: total };
    }

    const messagesDesc = await this.prisma.anonymousChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      skip: safeOffset,
      take: safeLimit,
    });

    return {
      messages: [...messagesDesc].reverse(),
      total,
      hasMoreMessages: total > safeOffset + messagesDesc.length,
      messagePageOffset: safeOffset,
      messagePageLimit: safeLimit,
    };
  }

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
      'Fitout Hub marked this support conversation as pending closure.',
      reason ? `Reason: ${reason}.` : null,
      `It will auto-close after ${formattedDueAt}. Reply here if you still need help.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private async detectEmergencyFromPrivateThread(threadId: string): Promise<boolean> {
    const latest = await (this.prisma as any).privateChatMessage.findFirst({
      where: { threadId },
      select: { context: true },
      orderBy: { createdAt: 'desc' },
    });
    const projectId = latest?.context?.projectId;
    if (!projectId) return false;
    const project = await this.prisma.project.findUnique({
      where: { id: String(projectId) },
      select: { isEmergency: true },
    });
    return Boolean(project?.isEmergency);
  }

  private async finalizeExpiredPrivateClosures() {
    const now = new Date();
    const rows = await (this.prisma as any).privateChatThread.findMany({
      where: {
        status: 'closure_pending',
        closureDueAt: { lte: now },
      },
      select: { id: true, statusTimeline: true },
      take: 200,
    });
    await Promise.all(
      rows.map((thread: any) =>
        (this.prisma as any).privateChatThread.update({
          where: { id: thread.id },
          data: {
            status: 'closed',
            resolvedAt: now,
            resolutionMode: 'sla_timeout',
            resolutionReason: 'SLA timeout after closure request',
            statusTimeline: this.appendTimelineEvent(thread.statusTimeline, {
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

  private async finalizeExpiredAnonymousClosures() {
    const now = new Date();
    const rows = await (this.prisma as any).anonymousChatThread.findMany({
      where: {
        status: 'closure_pending',
        closureDueAt: { lte: now },
      },
      select: { id: true, statusTimeline: true },
      take: 200,
    });
    await Promise.all(
      rows.map((thread: any) =>
        (this.prisma as any).anonymousChatThread.update({
          where: { id: thread.id },
          data: {
            status: 'closed',
            resolvedAt: now,
            resolutionMode: 'sla_timeout',
            resolutionReason: 'SLA timeout after closure request',
            statusTimeline: this.appendTimelineEvent(thread.statusTimeline, {
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

  // ===== PRIVATE CHAT (FOH Support) =====

  /**
   * Get or create a private chat thread for logged-in user or professional
   */
  async getOrCreatePrivateThread(
    userId?: string,
    professionalId?: string,
    includeArchived = false,
    messageLimit?: number,
    messageOffset?: number,
    projectId?: string | null,
  ): Promise<PrivateChatThreadDto> {
    await this.finalizeExpiredPrivateClosures();
    const scopedProjectId = projectId ?? null;
    const include = {
      user: { select: { firstName: true, surname: true, email: true } },
      professional: { select: { businessName: true, email: true } },
    };
    // Find existing thread scoped to this (user|professional, project)
    let thread = userId
      ? await this.prisma.privateChatThread.findFirst({
          where: { userId, projectId: scopedProjectId },
          include,
        })
      : professionalId
      ? await this.prisma.privateChatThread.findFirst({
          where: { professionalId, projectId: scopedProjectId },
          include,
        })
      : null;

    if (!thread) {
      const data: any = { projectId: scopedProjectId };
      if (userId) data.userId = userId;
      else if (professionalId) data.professionalId = professionalId;
      try {
        thread = await this.prisma.privateChatThread.create({ data, include });
      } catch (err: any) {
        // Handle stale Prisma client that still thinks unique constraint exists on userId/professionalId
        // Even though the DB constraint was dropped, the generated client may still validate it
        const targetColumns = Array.isArray(err?.meta?.target)
          ? err.meta.target.map((value: unknown) => String(value))
          : typeof err?.meta?.target === 'string'
          ? [err.meta.target]
          : [];
        const isLegacyUniqueConflict =
          err?.code === 'P2002' &&
          (targetColumns.includes('userId') || targetColumns.includes('professionalId'));

        if (isLegacyUniqueConflict) {
          console.warn('[ChatService] Unique constraint error during create (likely stale Prisma client), attempting recovery...', err.message);
          // Retry findFirst in case another request just created the thread
          thread = userId
            ? await this.prisma.privateChatThread.findFirst({
                where: { userId, projectId: scopedProjectId },
                include,
              })
            : professionalId
            ? await this.prisma.privateChatThread.findFirst({
                where: { professionalId, projectId: scopedProjectId },
                include,
              })
            : null;

          // Degraded fallback: if project-scoped create is blocked by legacy unique index,
          // use the existing general thread instead of failing with 500.
          if (!thread) {
            thread = userId
              ? await this.prisma.privateChatThread.findFirst({
                  where: { userId },
                  include,
                })
              : professionalId
              ? await this.prisma.privateChatThread.findFirst({
                  where: { professionalId },
                  include,
                })
              : null;
          }

          if (!thread) {
            // Still no thread, re-throw the original error
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    const page = await this.getPagedPrivateMessages(thread.id, messageLimit, messageOffset);
    const responseProjectId = scopedProjectId ?? thread.projectId ?? null;
    const scopedMessages =
      responseProjectId === thread.projectId
        ? page.messages
        : this.filterPrivateMessagesForContext(page.messages, responseProjectId);
    const unreadCount = await this.prisma.privateChatMessage.count({
      where: {
        threadId: thread.id,
        senderType: 'foh',
        readByFohAt: null,
      },
    });
    const scopedUnreadCount = scopedMessages.filter(
      (message: any) => message?.senderType === 'foh' && !message?.readByFohAt,
    ).length;
    return this.mapPrivateThreadDto({
      ...thread,
      ...page,
      projectId: responseProjectId,
      messages: scopedMessages,
      total: scopedMessages.length,
      unreadCount: responseProjectId === thread.projectId ? unreadCount : scopedUnreadCount,
      hasMoreMessages: responseProjectId === thread.projectId ? page.hasMoreMessages : false,
      messagePageOffset: responseProjectId === thread.projectId ? page.messagePageOffset : 0,
    });
  }

  /**
   * Get a private chat thread with messages
   */
  async getPrivateThread(
    threadId: string,
    includeArchived = false,
    messageLimit?: number,
    messageOffset?: number,
    projectId?: string | null,
  ): Promise<PrivateChatThreadDto> {
    await this.finalizeExpiredPrivateClosures();
    const thread = await this.prisma.privateChatThread.findUnique({
      where: { id: threadId },
      include: {
        user: { select: { firstName: true, surname: true, email: true } },
        professional: { select: { businessName: true, email: true } },
      },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    const page = await this.getPagedPrivateMessages(thread.id, messageLimit, messageOffset);
    const scopedProjectId = projectId ?? null;
    const responseProjectId = scopedProjectId ?? thread.projectId ?? null;
    const scopedMessages =
      responseProjectId === thread.projectId
        ? page.messages
        : this.filterPrivateMessagesForContext(page.messages, responseProjectId);
    const unreadCount = await this.prisma.privateChatMessage.count({
      where: {
        threadId: thread.id,
        senderType: 'foh',
        readByFohAt: null,
      },
    });
    const scopedUnreadCount = scopedMessages.filter(
      (message: any) => message?.senderType === 'foh' && !message?.readByFohAt,
    ).length;
    return this.mapPrivateThreadDto({
      ...thread,
      ...page,
      projectId: responseProjectId,
      messages: scopedMessages,
      total: scopedMessages.length,
      unreadCount: responseProjectId === thread.projectId ? unreadCount : scopedUnreadCount,
      hasMoreMessages: responseProjectId === thread.projectId ? page.hasMoreMessages : false,
      messagePageOffset: responseProjectId === thread.projectId ? page.messagePageOffset : 0,
    });
  }

  /**
   * Add a message to a private chat thread
   */
  async addPrivateMessage(
    threadId: string,
    senderType: string,
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
    attachments?: any[],
    context?: {
      pageType?: 'project_creation' | 'project_view' | 'general';
      pathname?: string;
      projectId?: string | null;
      projectName?: string | null;
    },
  ): Promise<PrivateChatMessageDto> {
    const thread = await (this.prisma as any).privateChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    const resolvedContext = thread.projectId
      ? {
          ...(context || {}),
          pageType: 'project_view' as const,
          projectId: thread.projectId,
          projectName: context?.projectName || undefined,
        }
      : context;

    const message = await this.prisma.privateChatMessage.create({
      data: {
        threadId,
        senderType,
        senderUserId,
        senderProId,
        content,
        attachments: attachments || [],
        context: resolvedContext || undefined,
      },
    });

    // Update thread's updatedAt
    await (this.prisma as any).privateChatThread.update({
      where: { id: threadId },
      data: {
        updatedAt: new Date(),
        status:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? 'in_progress'
            : thread.status,
        reopenedAt:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? new Date()
            : thread.reopenedAt,
        closureRequestedAt:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? null
            : thread.closureRequestedAt,
        closureDueAt:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? null
            : thread.closureDueAt,
        statusTimeline:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? this.appendTimelineEvent(thread.statusTimeline, {
                action: 'reopened_by_message',
                status: 'in_progress',
              })
            : thread.statusTimeline,
      },
    });

    const realtimeEvent = {
      type: 'chat.message.created',
      payload: {
        sourceType: 'private',
        threadId,
        senderType,
        message: this.mapPrivateMessageDto(message),
      },
    };

    if (thread.userId) {
      this.realtime.emitToUser(thread.userId, realtimeEvent);
    }
    if (thread.professionalId) {
      this.realtime.emitToProfessional(thread.professionalId, realtimeEvent);
    }
    void this.realtime.emitToAdmins(realtimeEvent);

    if (thread.status === 'closure_pending' || thread.status === 'closed') {
      const reopenEvent = {
        type: 'thread.status.changed',
        payload: {
          sourceType: 'private',
          threadId,
          status: 'in_progress',
          reason: 'reopened_by_message',
        },
      };
      if (thread.userId) {
        this.realtime.emitToUser(thread.userId, reopenEvent);
      }
      if (thread.professionalId) {
        this.realtime.emitToProfessional(thread.professionalId, reopenEvent);
      }
      void this.realtime.emitToAdmins(reopenEvent);
    }

    return this.mapPrivateMessageDto(message);
  }

  /**
   * Mark private thread as read by FOH
   */
  async markPrivateThreadAsRead(threadId: string): Promise<void> {
    await this.prisma.privateChatMessage.updateMany({
      where: { threadId },
      data: { readByFohAt: new Date() },
    });
  }

  /**
   * Close a private thread
   */
  async closePrivateThread(
    threadId: string,
    actorId?: string,
    options?: {
      resolutionReason?: string;
      resolutionMode?: 'user_confirmed' | 'sla_timeout';
    },
  ): Promise<void> {
    const thread = await (this.prisma as any).privateChatThread.findUnique({
      where: { id: threadId },
      select: { id: true, statusTimeline: true, userId: true, professionalId: true },
    });
    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }
    const now = new Date();
    const isEmergency = await this.detectEmergencyFromPrivateThread(threadId);
    const dueAt = new Date(now.getTime() + (isEmergency ? this.emergencyCloseMs : this.defaultCloseMs));
    const resolutionReason = options?.resolutionReason || 'Admin requested closure';
    await (this.prisma as any).privateChatThread.update({
      where: { id: threadId },
      data: {
        status: 'closure_pending',
        updatedAt: now,
        closureRequestedAt: now,
        closureDueAt: dueAt,
        resolvedBy: actorId ?? null,
        resolutionMode: options?.resolutionMode || 'user_confirmed',
        resolutionReason,
        statusTimeline: this.appendTimelineEvent(thread.statusTimeline, {
          action: 'closure_requested',
          status: 'closure_pending',
          actorId: actorId ?? null,
          reason: resolutionReason,
          mode: options?.resolutionMode || 'user_confirmed',
          metadata: {
            dueAt: dueAt.toISOString(),
            emergency: isEmergency,
          },
        }),
      },
    });

    const closureMessage = await this.prisma.privateChatMessage.create({
      data: {
        threadId,
        senderType: 'foh',
        senderUserId: null,
        senderProId: null,
        content: this.formatClosureNotice(dueAt, resolutionReason),
        attachments: [],
      },
    });

    const messageEvent = {
      type: 'chat.message.created',
      payload: {
        sourceType: 'private',
        threadId,
        senderType: 'foh',
        message: this.mapPrivateMessageDto(closureMessage),
      },
    };

    const statusEvent = {
      type: 'thread.status.changed',
      payload: {
        sourceType: 'private',
        threadId,
        status: 'closure_pending',
      },
    };

    if (thread.userId) {
      this.realtime.emitToUser(thread.userId, messageEvent);
      this.realtime.emitToUser(thread.userId, statusEvent);
    }
    if (thread.professionalId) {
      this.realtime.emitToProfessional(thread.professionalId, messageEvent);
      this.realtime.emitToProfessional(thread.professionalId, statusEvent);
    }
    void this.realtime.emitToAdmins(messageEvent);
    void this.realtime.emitToAdmins(statusEvent);
  }

  // ===== ANONYMOUS CHAT =====

  /**
   * Create an anonymous chat thread
   */
  async createAnonymousThread(sessionId: string): Promise<AnonymousChatThreadDto> {
    await this.finalizeExpiredAnonymousClosures();
    const thread = await this.prisma.anonymousChatThread.create({
      data: { sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return this.mapAnonymousThreadDto(thread);
  }

  /**
   * Get an anonymous chat thread
   */
  async getAnonymousThread(
    threadId: string,
    includeArchived = false,
    messageLimit?: number,
    messageOffset?: number,
  ): Promise<AnonymousChatThreadDto> {
    await this.finalizeExpiredAnonymousClosures();
    const thread = await this.prisma.anonymousChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Anonymous chat thread not found');
    }

    const page = await this.getPagedAnonymousMessages(thread.id, messageLimit, messageOffset);
    return this.mapAnonymousThreadDto({ ...thread, ...page, messages: page.messages });
  }

  /**
   * Add a message to an anonymous thread
   */
  async addAnonymousMessage(
    threadId: string,
    senderType: string,
    content: string,
    attachments?: any[],
    context?: {
      pageType?: 'project_creation' | 'project_view' | 'general';
      pathname?: string;
      projectId?: string | null;
      projectName?: string | null;
    },
  ): Promise<AnonymousChatMessageDto> {
    const thread = await (this.prisma as any).anonymousChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Anonymous chat thread not found');
    }

    const message = await this.prisma.anonymousChatMessage.create({
      data: {
        threadId,
        senderType,
        content,
        attachments: attachments || [],
        context: context || undefined,
      },
    });

    // Update thread's updatedAt
    await (this.prisma as any).anonymousChatThread.update({
      where: { id: threadId },
      data: {
        updatedAt: new Date(),
        status:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? 'in_progress'
            : thread.status,
        reopenedAt:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? new Date()
            : thread.reopenedAt,
        closureRequestedAt:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? null
            : thread.closureRequestedAt,
        closureDueAt:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? null
            : thread.closureDueAt,
        statusTimeline:
          thread.status === 'closure_pending' || thread.status === 'closed'
            ? this.appendTimelineEvent(thread.statusTimeline, {
                action: 'reopened_by_message',
                status: 'in_progress',
              })
            : thread.statusTimeline,
      },
    });

    const realtimeEvent = {
      type: 'chat.message.created',
      payload: {
        sourceType: 'anonymous',
        threadId,
        senderType,
        message: this.mapAnonymousMessageDto(message),
      },
    };
    void this.realtime.emitToAdmins(realtimeEvent);

    if (thread.status === 'closure_pending' || thread.status === 'closed') {
      void this.realtime.emitToAdmins({
        type: 'thread.status.changed',
        payload: {
          sourceType: 'anonymous',
          threadId,
          status: 'in_progress',
          reason: 'reopened_by_message',
        },
      });
    }

    return this.mapAnonymousMessageDto(message);
  }

  /**
   * Close an anonymous thread
   */
  async closeAnonymousThread(
    threadId: string,
    actorId?: string,
    options?: {
      resolutionReason?: string;
      resolutionMode?: 'user_confirmed' | 'sla_timeout';
    },
  ): Promise<void> {
    const thread = await (this.prisma as any).anonymousChatThread.findUnique({
      where: { id: threadId },
      select: { id: true, statusTimeline: true },
    });
    if (!thread) {
      throw new NotFoundException('Anonymous chat thread not found');
    }
    const now = new Date();
    const dueAt = new Date(now.getTime() + this.defaultCloseMs);
    const resolutionReason = options?.resolutionReason || 'Admin requested closure';
    await (this.prisma as any).anonymousChatThread.update({
      where: { id: threadId },
      data: {
        status: 'closure_pending',
        updatedAt: now,
        closureRequestedAt: now,
        closureDueAt: dueAt,
        resolvedBy: actorId ?? null,
        resolutionMode: options?.resolutionMode || 'user_confirmed',
        resolutionReason,
        statusTimeline: this.appendTimelineEvent(thread.statusTimeline, {
          action: 'closure_requested',
          status: 'closure_pending',
          actorId: actorId ?? null,
          reason: resolutionReason,
          mode: options?.resolutionMode || 'user_confirmed',
          metadata: {
            dueAt: dueAt.toISOString(),
            emergency: false,
          },
        }),
      },
    });

    const closureMessage = await this.prisma.anonymousChatMessage.create({
      data: {
        threadId,
        senderType: 'foh',
        content: this.formatClosureNotice(dueAt, resolutionReason),
        attachments: [],
      },
    });

    void this.realtime.emitToAdmins({
      type: 'chat.message.created',
      payload: {
        sourceType: 'anonymous',
        threadId,
        senderType: 'foh',
        message: this.mapAnonymousMessageDto(closureMessage),
      },
    });

    void this.realtime.emitToAdmins({
      type: 'thread.status.changed',
      payload: {
        sourceType: 'anonymous',
        threadId,
        status: 'closure_pending',
      },
    });
  }

  // ===== PROJECT CHAT (Post-Award Team Chat) =====

  /**
   * Get or create a project chat thread
   */
  async getOrCreateProjectThread(projectId: string): Promise<ProjectChatThreadDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if ((project.status || '').toLowerCase() === 'archived') {
      throw new ForbiddenException('Project is archived');
    }

    let thread = await this.prisma.projectChatThread.findUnique({
      where: { projectId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        project: { select: { projectName: true } },
      },
    });

    if (!thread) {
      thread = await this.prisma.projectChatThread.create({
        data: { projectId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          project: { select: { projectName: true } },
        },
      });
    }

    return this.mapProjectThreadDto(thread);
  }

  /**
   * Get a project chat thread
   */
  async getProjectThread(threadId: string): Promise<ProjectChatThreadDto> {
    const thread = await this.prisma.projectChatThread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        project: { select: { projectName: true } },
      },
    });

    if (!thread) {
      throw new NotFoundException('Project chat thread not found');
    }

    return this.mapProjectThreadDto(thread);
  }

  /**
   * Add a message to a project chat thread
   */
  async addProjectMessage(
    threadId: string,
    senderType: string,
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
    attachments?: any[],
  ): Promise<ProjectChatMessageDto> {
    const thread = await this.prisma.projectChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Project chat thread not found');
    }

    const message = await this.prisma.projectChatMessage.create({
      data: {
        threadId,
        senderType,
        senderUserId,
        senderProId,
        content,
        attachments: attachments || [],
      },
    });

    // Update thread's updatedAt
    await this.prisma.projectChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return this.mapProjectMessageDto(message);
  }

  // ===== HELPER MAPPERS =====

  private mapPrivateThreadDto(thread: any): PrivateChatThreadDto {
    return {
      id: thread.id,
      threadId: thread.id, // Alias for frontend compatibility
      userId: thread.userId,
      professionalId: thread.professionalId,
      projectId: thread.projectId ?? null,
      status: thread.status,
      closureRequestedAt: thread.closureRequestedAt?.toISOString(),
      closureDueAt: thread.closureDueAt?.toISOString(),
      resolvedAt: thread.resolvedAt?.toISOString(),
      resolutionReason: thread.resolutionReason || undefined,
      userName: thread.user ? `${thread.user.firstName} ${thread.user.surname}` : undefined,
      professionalName: thread.professional?.businessName,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m: any) => this.mapPrivateMessageDto(m)),
      unreadCount: thread.unreadCount ?? thread.messages.filter((m: any) => m.senderType === 'foh' && !m.readByFohAt).length,
      totalMessages: thread.total ?? thread.totalMessages,
      hasMoreMessages: thread.hasMoreMessages,
      messagePageOffset: thread.messagePageOffset,
      messagePageLimit: thread.messagePageLimit,
    };
  }

  private mapPrivateMessageDto(message: any): PrivateChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
      senderProId: message.senderProId,
      content: message.content,
      attachments: message.attachments || [],
      context: message.context || undefined,
      createdAt: message.createdAt.toISOString(),
      readByFohAt: message.readByFohAt?.toISOString(),
    };
  }

  private mapAnonymousThreadDto(thread: any): AnonymousChatThreadDto {
    return {
      id: thread.id,
      threadId: thread.id,
      sessionId: thread.sessionId,
      status: thread.status,
      closureRequestedAt: thread.closureRequestedAt?.toISOString(),
      closureDueAt: thread.closureDueAt?.toISOString(),
      resolvedAt: thread.resolvedAt?.toISOString(),
      resolutionReason: thread.resolutionReason || undefined,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m: any) => this.mapAnonymousMessageDto(m)),
      totalMessages: thread.total ?? thread.totalMessages,
      hasMoreMessages: thread.hasMoreMessages,
      messagePageOffset: thread.messagePageOffset,
      messagePageLimit: thread.messagePageLimit,
    };
  }

  private mapAnonymousMessageDto(message: any): AnonymousChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      content: message.content,
      attachments: message.attachments || [],
      context: message.context || undefined,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private mapProjectThreadDto(thread: any): ProjectChatThreadDto {
    return {
      id: thread.id,
      threadId: thread.id,
      projectId: thread.projectId,
      projectName: thread.project?.projectName,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m: any) => this.mapProjectMessageDto(m)),
    };
  }

  private mapProjectMessageDto(message: any): ProjectChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
      senderProId: message.senderProId,
      content: message.content,
      attachments: message.attachments || [],
      createdAt: message.createdAt.toISOString(),
    };
  }

  // ===== ADMIN INBOX =====

  /**
   * Get all threads for admin FOH inbox
   */
  async getAllThreadsForAdmin() {
    await Promise.all([
      this.finalizeExpiredPrivateClosures(),
      this.finalizeExpiredAnonymousClosures(),
    ]);
    // Fetch private threads
    const privateThreads = await this.prisma.privateChatThread.findMany({
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        user: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
        professional: {
          select: { id: true, businessName: true, email: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch anonymous threads
    const anonymousThreads = await this.prisma.anonymousChatThread.findMany({
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch project threads
    const projectThreads = await this.prisma.projectChatThread.findMany({
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        project: {
          select: { id: true, projectName: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Get unread counts separately for efficiency
    const unreadCounts = await Promise.all(
      privateThreads.map(async (thread) => {
        const count = await this.prisma.privateChatMessage.count({
          where: {
            threadId: thread.id,
            readByFohAt: null,
            senderType: { not: 'foh' },
          },
        });
        return { threadId: thread.id, count };
      }),
    );

    const unreadMap = Object.fromEntries(
      unreadCounts.map((item) => [item.threadId, item.count]),
    );

    // Map to unified format
    const threads = [
      ...privateThreads.map((thread) => ({
        id: thread.id,
        type: 'private' as const,
        userId: thread.userId,
        professionalId: thread.professionalId,
        projectId: thread.projectId ?? undefined,
        userName: thread.user ? `${thread.user.firstName} ${thread.user.surname}` : undefined,
        professionalName: thread.professional?.businessName,
        status: thread.status || 'open',
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: unreadMap[thread.id] || 0,
        lastMessage: thread.messages[0]?.content,
        lastMessageContext: thread.messages[0]?.context || undefined,
      })),
      ...anonymousThreads.map((thread) => ({
        id: thread.id,
        type: 'anonymous' as const,
        sessionId: thread.sessionId,
        status: thread.status || 'open',
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: 0, // Anonymous threads don't track read status yet
        lastMessage: thread.messages[0]?.content,
        lastMessageContext: thread.messages[0]?.context || undefined,
      })),
      ...projectThreads.map((thread) => ({
        id: thread.id,
        type: 'project' as const,
        projectId: thread.projectId,
        projectName: thread.project?.projectName,
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: 0, // Project threads don't track read status per user
        lastMessage: thread.messages[0]?.content,
      })),
    ];

    // Sort all threads by updatedAt
    threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { threads };
  }
}
