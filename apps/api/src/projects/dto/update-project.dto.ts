export class UpdateProjectDto {
  projectName?: string;
  clientName?: string;
  contractorName?: string;
  region?: string;
  budget?: number;
  status?: 'pending' | 'approved' | 'rejected';
  notes?: string;
  userId?: string;
  clientId?: string;
  tradesRequired?: string[];
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  isEmergency?: boolean;
}
