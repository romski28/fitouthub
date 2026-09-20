'use client';

import React from 'react';
import ProjectFinancialsCard from '@/components/project-financials-card';
import { CloseProjectPanel } from '@/components/close-project-panel';

interface ClientFinancialsTabProps {
  projectId: string;
  accessToken: string | null;
  projectCost: number;
  originalBudget?: string;
  projectStage?: string;
  onOpenChatTab?: () => void;
  onNavigateTab?: (tab: string) => void;
  openMaterialsWalletOnLoad?: boolean;
  onMaterialsWalletAutoOpenHandled?: () => void;
}

export const ClientFinancialsTab: React.FC<ClientFinancialsTabProps> = ({
  projectId,
  accessToken,
  projectCost,
  originalBudget,
  projectStage,
  onOpenChatTab,
  onNavigateTab,
  openMaterialsWalletOnLoad,
  onMaterialsWalletAutoOpenHandled,
}) => {
  if (!accessToken) {
    return (
      <div className="rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-6 text-sm text-slate-600">
        Please log in to view project financials.
      </div>
    );
  }

  const normalizedStage = String(projectStage || '').toUpperCase();
  const inClosePhase = normalizedStage === 'COMPLETE' || normalizedStage === 'WARRANTY_PERIOD';

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
        openMaterialsWalletOnLoad={openMaterialsWalletOnLoad}
        onMaterialsWalletAutoOpenHandled={onMaterialsWalletAutoOpenHandled}
      />
      {inClosePhase && (
        <CloseProjectPanel projectId={projectId} accessToken={accessToken} role="client" />
      )}
    </div>
  );
};
