export class CreateProjectDto {
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: number;
  status?: 'pending' | 'approved' | 'rejected';
  notes?: string;
  userId?: string;
  clientId?: string;
  professionalIds: string[]; // Required: array of professional IDs to invite
}
