export class CreateProjectDto {
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: number;
  status?: 'pending' | 'awarded' | 'withdrawn' | 'started' | 'completed' | 'rated';
  notes?: string;
  userId?: string;
  clientId?: string;
  professionalIds?: string[]; // Optional: can invite professionals later
  tradesRequired?: string[];
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  isEmergency?: boolean;
  onlySelectedProfessionalsCanBid?: boolean;
  photos?: Array<{ url: string; note?: string }>;
  photoUrls?: string[]; // Legacy compatibility
  userPrompt?: string; // Original natural language prompt from user search/creation for AI training
  aiIntakeId?: string; // Link to AI intake that generated this project
}
