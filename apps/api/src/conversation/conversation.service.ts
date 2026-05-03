import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConversationContainerType,
  ConversationChannelKey,
  ConversationActorType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface AttachmentRef {
  url: string;
  filename: string;
  mimeType?: string;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── Core: resolve or create ───────────────────────────────────────────────

  /**
   * Idempotent: returns the existing conversation or creates a new one.
   * scopeKey defaults to 'general' when omitted.
   */
  async resolveOrCreate(
    containerType: ConversationContainerType,
    containerId: string,
    channelKey: ConversationChannelKey,
    scopeKey = 'general',
  ) {
    return this.prisma.conversation.upsert({
      where: {
        containerType_containerId_channelKey_scopeKey: {
          containerType,
          containerId,
          channelKey,
          scopeKey,
        },
      },
      create: { containerType, containerId, channelKey, scopeKey, status: 'open' },
      update: {},
    });
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  /**
   * Paginated message list for a conversation, newest-first internally
   * then returned in chronological order (oldest first).
   * Soft-deleted messages are excluded from content but their IDs are kept
   * for read-state cursor integrity.
   */
  async listMessages(
    conversationId: string,
    limit = 50,
    offset = 0,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const total = await this.prisma.conversationMessage.count({
      where: { conversationId, deletedAt: null },
    });

    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: safeOffset,
      take: safeLimit,
    });

    return {
      messages: [...rows].reverse(),
      total,
      hasMore: total > safeOffset + rows.length,
      offset: safeOffset,
      limit: safeLimit,
    };
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async sendMessage(
    conversationId: string,
    senderType: ConversationActorType,
    senderActorId: string,
    content: string,
    attachments: AttachmentRef[] = [],
    metadata?: Record<string, unknown>,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const message = await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        senderType,
        senderActorId,
        content,
        attachments: attachments as unknown as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
    });

    // Touch conversation.updatedAt so it surfaces in recency sorts
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Emit realtime event so connected clients receive the message
    this.realtime.emitToChannel(
      `conversation:${conversationId}`,
      { type: 'conversation:message', payload: { conversationId, message } },
    );

    return message;
  }

  // ── Read state ────────────────────────────────────────────────────────────

  /**
   * Upsert the read watermark for an actor in a conversation.
   * Only advances forward — ignores the update if the supplied message is
   * older than the current watermark.
   * If lastReadMessageId is omitted, records a timestamp-only watermark
   * (useful before any ConversationMessages exist for this conversation).
   */
  async markRead(
    conversationId: string,
    actorType: ConversationActorType,
    actorId: string,
    lastReadMessageId?: string,
  ) {
    const now = new Date();

    if (lastReadMessageId) {
      const msg = await this.prisma.conversationMessage.findFirst({
        where: { id: lastReadMessageId, conversationId },
        select: { id: true, createdAt: true },
      });
      if (!msg) throw new NotFoundException('Message not found in conversation');

      const existing = await this.prisma.conversationReadState.findUnique({
        where: {
          conversationId_actorType_actorId: { conversationId, actorType, actorId },
        },
        include: { lastReadMessage: { select: { createdAt: true } } },
      });

      // Do not move the watermark backwards
      if (
        existing?.lastReadMessage &&
        existing.lastReadMessage.createdAt >= msg.createdAt
      ) {
        return existing;
      }

      return this.prisma.conversationReadState.upsert({
        where: {
          conversationId_actorType_actorId: { conversationId, actorType, actorId },
        },
        create: { conversationId, actorType, actorId, lastReadMessageId, lastReadAt: now },
        update: { lastReadMessageId, lastReadAt: now },
      });
    }

    // Timestamp-only watermark (no message ID)
    return this.prisma.conversationReadState.upsert({
      where: {
        conversationId_actorType_actorId: { conversationId, actorType, actorId },
      },
      create: { conversationId, actorType, actorId, lastReadAt: now },
      update: { lastReadAt: now },
    });
  }

  /**
   * Count messages sent after the actor's last-read watermark.
   * Returns 0 if no watermark exists yet (all messages are "unread").
   * Capped at 99 for display purposes.
   */
  async computeUnread(
    conversationId: string,
    actorType: ConversationActorType,
    actorId: string,
  ): Promise<number> {
    const readState = await this.prisma.conversationReadState.findUnique({
      where: {
        conversationId_actorType_actorId: { conversationId, actorType, actorId },
      },
      include: { lastReadMessage: { select: { createdAt: true } } },
    });

    // Prefer message-level cursor; fall back to timestamp watermark; default to epoch
    const afterDate =
      readState?.lastReadMessage?.createdAt ??
      readState?.lastReadAt ??
      new Date(0);

    const count = await this.prisma.conversationMessage.count({
      where: {
        conversationId,
        deletedAt: null,
        createdAt: { gt: afterDate },
        // Exclude the actor's own messages from unread count
        NOT: { senderType: actorType, senderActorId: actorId },
      },
    });

    return Math.min(count, 99);
  }

  // ── Participants ──────────────────────────────────────────────────────────

  async ensureParticipant(
    conversationId: string,
    actorType: ConversationActorType,
    actorId: string,
    role: string,
  ) {
    return this.prisma.conversationParticipant.upsert({
      where: {
        conversationId_actorType_actorId: { conversationId, actorType, actorId },
      },
      create: { conversationId, actorType, actorId, role },
      update: { leftAt: null }, // re-join if they had left
    });
  }

  async getReadStates(conversationId: string) {
    return this.prisma.conversationReadState.findMany({
      where: { conversationId },
      include: { lastReadMessage: { select: { id: true, createdAt: true } } },
    });
  }
}
