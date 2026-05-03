import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ConversationContainerType, ConversationChannelKey, ConversationActorType } from '@prisma/client';
import { ConversationService } from './conversation.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('conversations')
@UseGuards(CombinedAuthGuard)
export class ConversationController {
  constructor(private readonly svc: ConversationService) {}

  /**
   * GET /conversations/resolve
   * Resolve (or create) a conversation by its container + channel + scope.
   * Query params: containerType, containerId, channelKey, scopeKey?
   */
  @Get('resolve')
  async resolve(
    @Query('containerType') containerType: string,
    @Query('containerId') containerId: string,
    @Query('channelKey') channelKey: string,
    @Query('scopeKey') scopeKey?: string,
  ) {
    if (!containerType || !containerId || !channelKey) {
      throw new BadRequestException('containerType, containerId and channelKey are required');
    }
    return this.svc.resolveOrCreate(
      containerType as ConversationContainerType,
      containerId,
      channelKey as ConversationChannelKey,
      scopeKey,
    );
  }

  /**
   * GET /conversations/:id/messages
   * List messages (paginated, chronological).
   */
  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.svc.listMessages(
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /**
   * POST /conversations/:id/messages
   * Send a message.
   * Body: { senderType, senderActorId, content, attachments?, metadata? }
   */
  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body()
    body: {
      senderType: string;
      senderActorId: string;
      content: string;
      attachments?: Array<{ url: string; filename: string; mimeType?: string }>;
      metadata?: Record<string, unknown>;
    },
  ) {
    if (!body.senderType || !body.senderActorId || !body.content?.trim()) {
      throw new BadRequestException('senderType, senderActorId and content are required');
    }
    return this.svc.sendMessage(
      id,
      body.senderType as ConversationActorType,
      body.senderActorId,
      body.content,
      body.attachments,
      body.metadata,
    );
  }

  /**
   * POST /conversations/:id/read
   * Mark read watermark for an actor.
   * Body: { actorType, actorId, lastReadMessageId }
   */
  @Post(':id/read')
  async markRead(
    @Param('id') id: string,
    @Body()
    body: {
      actorType: string;
      actorId: string;
      lastReadMessageId: string;
    },
  ) {
    if (!body.actorType || !body.actorId || !body.lastReadMessageId) {
      throw new BadRequestException('actorType, actorId and lastReadMessageId are required');
    }
    return this.svc.markRead(
      id,
      body.actorType as ConversationActorType,
      body.actorId,
      body.lastReadMessageId,
    );
  }

  /**
   * GET /conversations/:id/unread
   * Get unread count for an actor.
   * Query params: actorType, actorId
   */
  @Get(':id/unread')
  async getUnread(
    @Param('id') id: string,
    @Query('actorType') actorType: string,
    @Query('actorId') actorId: string,
  ) {
    if (!actorType || !actorId) {
      throw new BadRequestException('actorType and actorId are required');
    }
    const count = await this.svc.computeUnread(
      id,
      actorType as ConversationActorType,
      actorId,
    );
    return { conversationId: id, actorType, actorId, unread: count };
  }

  /**
   * GET /conversations/:id/read-states
   * Get all read states for a conversation (for receipt display).
   */
  @Get(':id/read-states')
  async getReadStates(@Param('id') id: string) {
    return this.svc.getReadStates(id);
  }

  /**
   * POST /conversations/:id/participants
   * Ensure a participant is on the conversation.
   * Body: { actorType, actorId, role }
   */
  @Post(':id/participants')
  async ensureParticipant(
    @Param('id') id: string,
    @Body() body: { actorType: string; actorId: string; role: string },
  ) {
    if (!body.actorType || !body.actorId || !body.role) {
      throw new BadRequestException('actorType, actorId and role are required');
    }
    return this.svc.ensureParticipant(
      id,
      body.actorType as ConversationActorType,
      body.actorId,
      body.role,
    );
  }
}
