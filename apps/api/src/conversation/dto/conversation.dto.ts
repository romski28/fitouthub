import { ConversationContainerType, ConversationChannelKey, ConversationActorType } from '@prisma/client';

export class ResolveConversationDto {
  containerType: ConversationContainerType;
  containerId: string;
  channelKey: ConversationChannelKey;
  scopeKey?: string;
}

export class SendMessageDto {
  senderType: ConversationActorType;
  senderActorId: string;
  content: string;
  attachments?: Array<{ url: string; filename: string; mimeType?: string }>;
  metadata?: Record<string, unknown>;
}

export class MarkReadDto {
  actorType: ConversationActorType;
  actorId: string;
  lastReadMessageId: string;
}

export class GetUnreadDto {
  actorType: ConversationActorType;
  actorId: string;
}
