export class CreateAnonymousMessageDto {
  content: string;
  attachments?: { url: string; filename: string }[];
}

export class AnonymousChatMessageDto {
  id: string;
  threadId: string;
  senderType: 'anonymous' | 'foh';
  content: string;
  attachments?: any[];
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
