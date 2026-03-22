export class CreatePrivateMessageDto {
  content: string;
  attachments?: { url: string; filename: string }[];
  context?: {
    pageType?: 'project_creation' | 'project_view' | 'general';
    pathname?: string;
    projectId?: string | null;
  };
}
