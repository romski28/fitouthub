import { API_BASE_URL } from '@/config/api';

export type NextStepAction = {
  actionKey: string;
  actionLabel: string;
  description?: string;
  isPrimary: boolean;
  isElective: boolean;
  requiresAction: boolean;
};

type NextStepResponse = {
  PRIMARY?: NextStepAction[];
  ELECTIVE?: NextStepAction[];
};

export class NextStepAuthError extends Error {
  constructor() {
    super('Unauthorized to fetch next steps');
    this.name = 'NextStepAuthError';
  }
}

export async function fetchPrimaryNextStep(
  projectId: string,
  token: string,
): Promise<NextStepAction | null> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/next-steps`, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new NextStepAuthError();
  }

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
