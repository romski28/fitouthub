export class RespondProjectStartProposalDto {
  status: 'accepted' | 'declined' | 'updated';
  updatedScheduledAt?: string;
  responseNotes?: string;
}
