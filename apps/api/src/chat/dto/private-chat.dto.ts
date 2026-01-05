export class PrivateChatMessageDto {
  id: string;
  threadId: string;
  senderType: 'user' | 'professional' | 'foh';
  senderUserId?: string;
  senderProId?: string;
  content: string;
  createdAt: string;
  readByFohAt?: string;
}

export class PrivateChatThreadDto {
  id: string;
  userId?: string;
  professionalId?: string;
  userName?: string;
  professionalName?: string;
  createdAt: string;
  updatedAt: string;
  messages: PrivateChatMessageDto[];
  unreadCount?: number;
  threadId?: string; // alias for id (for compatibility with frontend)
}
