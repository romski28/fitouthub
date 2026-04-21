'use client';

import React from 'react';
import ProjectFinancialsCard from '@/components/project-financials-card';

interface ClientFinancialsTabProps {
  projectId: string;
  accessToken: string | null;
  projectCost: number;
  originalBudget?: string;
  onOpenChatTab?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const ClientFinancialsTab: React.FC<ClientFinancialsTabProps> = ({
  projectId,
  accessToken,
  projectCost,
  originalBudget,
  onOpenChatTab,
  onNavigateTab,
}) => {
  if (!accessToken) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-sm text-slate-300">
        Please log in to view project financials.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectFinancialsCard
        projectId={projectId}
        accessToken={accessToken}
        projectCost={projectCost}
        originalBudget={originalBudget}
        role="client"
        onClarify={() => onOpenChatTab?.()}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
};
