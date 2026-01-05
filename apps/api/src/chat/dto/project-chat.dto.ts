export class CreateProjectChatMessageDto {
  content: string;
}

export class ProjectChatMessageDto {
  id: string;
  threadId: string;
  senderType: 'client' | 'professional' | 'foh';
  senderUserId?: string;
  senderProId?: string;
  content: string;
  createdAt: string;
}

export class ProjectChatThreadDto {
  id: string;
  projectId: string;
  projectName?: string;
  createdAt: string;
  updatedAt: string;
  messages: ProjectChatMessageDto[];
  threadId?: string; // alias for id
}
