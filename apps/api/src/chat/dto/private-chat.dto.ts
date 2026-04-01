export class PrivateChatMessageDto {
  id: string;
  threadId: string;
  senderType: 'user' | 'professional' | 'foh';
  senderUserId?: string;
  senderProId?: string;
  content: string;
  attachments?: any[];
  context?: {
    pageType?: 'project_creation' | 'project_view' | 'general';
    pathname?: string;
    projectId?: string | null;
  };
  createdAt: string;
  readByFohAt?: string;
}

export class PrivateChatThreadDto {
  id: string;
  userId?: string;
  professionalId?: string;
  projectId?: string | null;
  status?: string;
  closureRequestedAt?: string;
  closureDueAt?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  userName?: string;
  professionalName?: string;
  createdAt: string;
  updatedAt: string;
  messages: PrivateChatMessageDto[];
  unreadCount?: number;
  totalMessages?: number;
  hasMoreMessages?: boolean;
  messagePageOffset?: number;
  messagePageLimit?: number;
  threadId?: string; // alias for id (for compatibility with frontend)
}
