export class CreateAnonymousMessageDto {
  content: string;
}

export class AnonymousChatMessageDto {
  id: string;
  threadId: string;
  senderType: 'anonymous' | 'foh';
  content: string;
  createdAt: string;
}

export class AnonymousChatThreadDto {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: AnonymousChatMessageDto[];
  threadId?: string; // alias for id
}
