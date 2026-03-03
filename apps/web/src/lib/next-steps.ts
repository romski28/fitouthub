import { API_BASE_URL } from '@/config/api';

export type NextStepAction = {
  actionKey: string;
  actionLabel: string;
  description?: string;
  isPrimary: boolean;
  isElective: boolean;
};

type NextStepResponse = {
  PRIMARY?: NextStepAction[];
  ELECTIVE?: NextStepAction[];
};

export async function fetchPrimaryNextStep(
  projectId: string,
  token: string,
): Promise<NextStepAction | null> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/next-steps`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as NextStepResponse;
  return data.PRIMARY?.[0] ?? null;
}

export async function completeNextStep(
  projectId: string,
  actionKey: string,
  token: string,
): Promise<boolean> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/next-steps/${encodeURIComponent(actionKey)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userAction: 'COMPLETED' }),
    },
  );

  return response.ok;
}
