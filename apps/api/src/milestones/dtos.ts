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
  startTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
  endTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
  estimatedHours?: number;
  siteAccessRequired?: boolean;
  siteAccessNotes?: string;
  description?: string;
}

export class UpdateMilestoneDto {
  title?: string;
  status?: 'not_started' | 'in_progress' | 'completed';
  percentComplete?: number;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualEndDate?: Date;
  startTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
  endTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
  estimatedHours?: number;
  siteAccessRequired?: boolean;
  siteAccessNotes?: string;
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
  startTimeSlot?: string;
  endTimeSlot?: string;
  estimatedHours?: number;
  siteAccessRequired: boolean;
  siteAccessNotes?: string;
  description?: string;
  photoUrls: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateMultipleMilestonesDto {
  projectId: string;
  projectProfessionalId?: string;
  milestones: CreateMilestoneDto[];
}
