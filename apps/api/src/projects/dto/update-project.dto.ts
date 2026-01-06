export class UpdateProjectDto {
  projectName?: string;
  clientName?: string;
  contractorName?: string;
  region?: string;
  budget?: number;
  status?: 'pending' | 'awarded' | 'withdrawn' | 'started' | 'completed' | 'rated';
  notes?: string;
  userId?: string;
  clientId?: string;
  tradesRequired?: string[];
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  isEmergency?: boolean;
  photos?: Array<{ url: string; note?: string }>;
  photoUrls?: string[]; // Legacy compatibility
}
