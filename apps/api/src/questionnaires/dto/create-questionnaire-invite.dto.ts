export class CreateQuestionnaireInviteDto {
  email!: string;
  recipientName?: string;
  roleLabel?: string;
  companyName?: string;
  projectId?: string;
  professionalId?: string;
  expiresInDays?: number;
  customMessage?: string;
}
