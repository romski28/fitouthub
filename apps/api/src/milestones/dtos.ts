export class CreateMilestoneDto {
  projectId: string;
  projectProfessionalId?: string;
  templateId?: string;
  title: string;
  sequence: number;
  status?: 'not_started' | 'in_progress' | 'completed';
  percentComplete?: number;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  description?: string;
}

export class UpdateMilestoneDto {
  title?: string;
  status?: 'not_started' | 'in_progress' | 'completed';
  percentComplete?: number;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualEndDate?: Date;
  description?: string;
  photoUrls?: string[];
  notes?: string;
}

export class MilestoneResponseDto {
  id: string;
  title: string;
  sequence: number;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualEndDate?: Date;
  description?: string;
  photoUrls: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateMultipleMilestonesDto {
  projectId: string;
  milestones: CreateMilestoneDto[];
}
