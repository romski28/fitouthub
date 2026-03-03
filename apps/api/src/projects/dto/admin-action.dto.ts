export class CreateAdminActionDto {
  projectId: string;

  actionType: string;

  reason?: string;

  triggerCondition?: string | null;

  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  requiredByDate?: Date;

  assignedToAdminId?: string;
}

export class UpdateAdminActionDto {
  status?: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';

  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  assignedToAdminId?: string;

  approvalDetails?: Record<string, any>;

  notes?: string;
}

export class AssignAdminActionDto {
  adminUserId: string;
}

export class CompleteAdminActionDto {
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';

  notes?: string;

  approvalDetails?: Record<string, any>;
}
