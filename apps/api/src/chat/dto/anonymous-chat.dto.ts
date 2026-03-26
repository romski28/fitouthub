export class CreateAnonymousMessageDto {
  content: string;
  attachments?: { url: string; filename: string }[];
  context?: {
    pageType?: 'project_creation' | 'project_view' | 'general';
    pathname?: string;
    projectId?: string | null;
  };
}

export class AnonymousChatMessageDto {
  id: string;
  threadId: string;
  senderType: 'anonymous' | 'foh';
  content: string;
  attachments?: any[];
  context?: {
    pageType?: 'project_creation' | 'project_view' | 'general';
    pathname?: string;
    projectId?: string | null;
  };
  createdAt: string;
}

export class AnonymousChatThreadDto {
  id: string;
  sessionId: string;
  status?: string;
  closureRequestedAt?: string;
  closureDueAt?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  createdAt: string;
  updatedAt: string;
  messages: AnonymousChatMessageDto[];
  totalMessages?: number;
  hasMoreMessages?: boolean;
  messagePageOffset?: number;
  messagePageLimit?: number;
  threadId?: string; // alias for id
}
