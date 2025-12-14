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
  professionalId: string; // Required: which professional this project is for
}
