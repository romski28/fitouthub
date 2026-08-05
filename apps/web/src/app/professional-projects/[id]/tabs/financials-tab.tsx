'use client';

import React from 'react';
import ProjectFinancialsCard from '@/components/project-financials-card';
import { PaymentRequestModal } from '@/components/next-steps/payment-request-modal';

interface FinancialsTabProps {
  projectStatus: string;
  awardedAmount?: number;
  accessToken?: string | null;
  projectId?: string;
  projectProfessionalId?: string;
  onNavigateTab?: (tab: string) => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({
  projectStatus,
  awardedAmount,
  accessToken,
  projectId,
  projectProfessionalId,
  onNavigateTab,
}) => {
  const [showPaymentRequestModal, setShowPaymentRequestModal] = React.useState(false);
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
      {/* Request additional works - ad hoc payment request for out-of-scope work */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowPaymentRequestModal(true)}
          className="rounded-lg bg-[#FF7F50] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E67245] transition"
        >
          + Request additional works payment
        </button>
      </div>

      <ProjectFinancialsCard
        key={refreshKey}
        projectId={projectId}
        projectProfessionalId={projectProfessionalId}
        accessToken={accessToken}
        projectCost={projectCost}
        role="professional"
        onNavigateTab={onNavigateTab}
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
    </div>
  );
};