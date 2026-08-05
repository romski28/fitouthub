'use client';

import React from 'react';
import ProjectFinancialsCard from '@/components/project-financials-card';
import { PaymentRequestModal } from '@/components/next-steps/payment-request-modal';
import { QuoteActionModal } from '@/components/next-steps/quote-action-modal';

interface FinancialsTabProps {
  tab?: string;
  projectStatus: string;
  awardedAmount?: number;
  accessToken?: string | null;
  projectId?: string;
  projectProfessionalId?: string;
  onNavigateTab?: (tab: string) => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({
  tab: _tab,
  projectStatus,
  awardedAmount,
  accessToken,
  projectId,
  projectProfessionalId,
  onNavigateTab,
}) => {
  const [showPaymentRequestModal, setShowPaymentRequestModal] = React.useState(false);
  const [showViewQuoteModal, setShowViewQuoteModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const isAwarded = projectStatus === 'awarded';

  if (!isAwarded) {
    return (
      <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] px-4 py-3 text-sm text-slate-900">
        Financials will be available once your quote is awarded.
      </div>
    );
  }

  if (!accessToken || !projectId) {
    return (
      <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] px-4 py-3 text-sm text-slate-600">
        Please log in to view project financials.
      </div>
    );
  }

  const projectCost = awardedAmount || 0;

  return (
    <div className="space-y-4">
      <ProjectFinancialsCard
        key={refreshKey}
        projectId={projectId}
        projectProfessionalId={projectProfessionalId}
        accessToken={accessToken}
        projectCost={projectCost}
        role="professional"
        onNavigateTab={onNavigateTab}
        onViewQuote={() => setShowViewQuoteModal(true)}
        onRequestAdditionalWorks={() => setShowPaymentRequestModal(true)}
      />

      <PaymentRequestModal
        isOpen={showPaymentRequestModal}
        onClose={() => setShowPaymentRequestModal(false)}
        accessToken={accessToken}
        projectId={projectId}
        projectProfessionalId={projectProfessionalId}
        onSubmitted={() => {
          setRefreshKey((k) => k + 1);
        }}
      />

      <QuoteActionModal
        isOpen={showViewQuoteModal}
        onClose={() => setShowViewQuoteModal(false)}
        readOnly
        projectId={projectId}
        projectProfessionalId={projectProfessionalId}
      />
    </div>
  );
};