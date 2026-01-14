export class CreatePrivateMessageDto {
  content: string;
  attachments?: { url: string; filename: string }[];
}
