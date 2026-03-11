export class CreateCallbackDto {
  clientName: string;
  clientEmail?: string;
  /** Phone number to call back (optional) */
  phone?: string;
  /** What the client needs help with */
  notes?: string;
  /** Optional project ID if the request is project-related */
  projectId?: string;
}

export class ReplyDto {
  message: string;
}

export class UpdateNotesDto {
  notes: string;
}

export class LinkProjectDto {
  projectId: string;
}
