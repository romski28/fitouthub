export class GetNextStepsDto {
  projectId: string;

  role: string;
}

export class RecordNextStepActionDto {
  projectId: string;

  actionKey: string;

  userAction: 'COMPLETED' | 'SKIPPED' | 'DEFERRED' | 'ALTERNATIVE';

  metadata?: Record<string, any>;
}

export class TransitionProjectStageDto {
  projectId: string;

  newStage: string;
}

export class PauseProjectDto {
  projectId: string;

  reason?: string;
}

export class ResumeProjectDto {
  projectId: string;

  resumeToStage: string;
}

export class DisputeProjectDto {
  projectId: string;

  reason?: string;
}
