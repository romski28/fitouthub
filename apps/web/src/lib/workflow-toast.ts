import toast from 'react-hot-toast';
import { fetchPrimaryNextStep, NextStepAuthError } from './next-steps';

type WorkflowGuidance = {
  nextStepLabel: string;
  canActNow: boolean;
  waitReason?: string;
};

type WorkflowToastOptions = {
  successMessage: string;
  projectId?: string | null;
  token?: string | null;
  fallbackGuidance?: WorkflowGuidance;
  preferFallbackGuidance?: boolean;
};

const DEFAULT_SUCCESS_DURATION_MS = 4000;
const CAN_ACT_NOW_DURATION_MS = 5500;
const WAITING_DURATION_MS = 7000;

const normalizeLabel = (label: string): string => label.trim().replace(/[.!?]+$/, '');

const buildSuccessMessage = (
  successMessage: string,
  guidance: WorkflowGuidance,
): string => {
  const nextStepLabel = normalizeLabel(guidance.nextStepLabel);

  if (guidance.canActNow) {
    return `${successMessage} Next step: ${nextStepLabel}. You can do this now.`;
  }

  const waitReason =
    guidance.waitReason ||
    'No action needed from you right now; please wait for the other party.';

  return `${successMessage} Next step: ${nextStepLabel}. ${waitReason}`;
};

export async function showWorkflowSuccessToast(
  options: WorkflowToastOptions,
): Promise<void> {
  let guidance = options.fallbackGuidance;

  if (!options.preferFallbackGuidance && options.projectId && options.token) {
    try {
      const primaryNextStep = await fetchPrimaryNextStep(
        options.projectId,
        options.token,
      );

      if (primaryNextStep) {
        guidance = {
          nextStepLabel: primaryNextStep.actionLabel,
          canActNow: Boolean(primaryNextStep.requiresAction),
        };
      }
    } catch (error) {
      if (error instanceof NextStepAuthError) {
        throw error;
      }
    }
  }

  if (!guidance) {
    toast.success(options.successMessage, {
      duration: DEFAULT_SUCCESS_DURATION_MS,
    });
    return;
  }

  toast.success(buildSuccessMessage(options.successMessage, guidance), {
    duration: guidance.canActNow
      ? CAN_ACT_NOW_DURATION_MS
      : WAITING_DURATION_MS,
  });
}
