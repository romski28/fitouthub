'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { showWorkflowSuccessToast } from '@/lib/workflow-toast';

interface ContractData {
  projectId: string;
  projectName: string;
  contractType: string | null;
  contractContent: string | null;
  contractGeneratedAt: string | null;
  clientSignedAt: string | null;
  clientSignedBy: {
    id: string;
    firstName: string;
    surname: string;
    email: string;
  } | null;
  professionalSignedAt: string | null;
  professionalSignedBy: {
    id: string;
    firstName: string;
    surname: string;
    email: string;
  } | null;
  isFullySigned: boolean;
  canSign: boolean;
}

interface ContractTabProps {
  tab?: string;
  projectId: string;
  accessToken: string | null;
}

const formatDate = (date?: string | null) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

export const ContractTab: React.FC<ContractTabProps> = ({
  projectId,
  accessToken,
}) => {
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContract = useCallback(async () => {
    if (!accessToken) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/contract`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch contract');
      }

      const data = await response.json();
      setContract(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load contract';
      console.error('Error fetching contract:', err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  const handleSignContract = async () => {
    if (!contract?.canSign || !accessToken) return;

    try {
      setSigning(true);

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/contract/sign`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sign contract');
      }

      const result = await response.json();
      await showWorkflowSuccessToast({
        successMessage: 'Contract signed successfully!',
        projectId,
        token: accessToken,
        preferFallbackGuidance: true,
        fallbackGuidance: result.isFullySigned
          ? {
              nextStepLabel: 'Wait for client escrow deposit',
              canActNow: false,
              waitReason:
                'No action needed now; the client must deposit funds to escrow.',
            }
          : {
              nextStepLabel: 'Wait for client signature',
              canActNow: false,
              waitReason:
                'No action needed now; the client needs to sign the contract.',
            },
      });

      // Refresh contract data
      await fetchContract();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to sign contract';
      console.error('Error signing contract:', err);
      toast.error(message);
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-rose-50 border border-rose-200 p-6 text-center">
        <svg
          className="mx-auto h-12 w-12 text-rose-400 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-rose-800 font-medium">{error}</p>
      </div>
    );
  }

  if (!contract) return null;

  return (
    <div className="space-y-6">
      {/* Contract Header */}
      <div className="rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Renovation Services Agreement
            </h2>
            <p className="text-slate-300 text-sm">
              {contract.projectName}
            </p>
            {contract.contractGeneratedAt && (
              <p className="text-slate-400 text-xs mt-1">
                Generated: {formatDate(contract.contractGeneratedAt)}
              </p>
            )}
          </div>
          <div>
            {contract.isFullySigned ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Fully Signed
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <svg className="w-4 h-4 mr-1 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Pending Signatures
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Signature Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client Signature */}
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Client Signature</h3>
          {contract.clientSignedAt ? (
            <div className="space-y-2">
              <div className="flex items-center text-emerald-700">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Signed</span>
              </div>
              {contract.clientSignedBy && (
                <p className="text-sm text-slate-600">
                  {contract.clientSignedBy.firstName} {contract.clientSignedBy.surname}
                </p>
              )}
              <p className="text-xs text-slate-500">
                {formatDate(contract.clientSignedAt)}
              </p>
            </div>
          ) : (
            <div className="flex items-center text-slate-400">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Awaiting Signature</span>
            </div>
          )}
        </div>

        {/* Professional Signature */}
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Professional Signature</h3>
          {contract.professionalSignedAt ? (
            <div className="space-y-2">
              <div className="flex items-center text-emerald-700">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Signed</span>
              </div>
              {contract.professionalSignedBy && (
                <p className="text-sm text-slate-600">
                  {contract.professionalSignedBy.firstName} {contract.professionalSignedBy.surname}
                </p>
              )}
              <p className="text-xs text-slate-500">
                {formatDate(contract.professionalSignedAt)}
              </p>
            </div>
          ) : (
            <div className="flex items-center text-slate-400">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Awaiting Signature</span>
            </div>
          )}
        </div>
      </div>

      {/* Contract Content */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-sm font-medium text-slate-700">Contract Document</h3>
        </div>
        <div className="p-6">
          <div className="bg-slate-50 rounded p-6 border border-slate-200 max-h-[600px] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm text-slate-800 font-mono leading-relaxed">
              {contract.contractContent}
            </pre>
          </div>
        </div>
      </div>

      {/* Sign Button */}
      {contract.canSign && !contract.isFullySigned && (
        <div className="flex justify-center">
          <button
            onClick={handleSignContract}
            disabled={signing}
            className="inline-flex items-center px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {signing ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Sign Contract as Professional
              </>
            )}
          </button>
        </div>
      )}

      {/* Fully Signed Notice */}
      {contract.isFullySigned && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
          <svg
            className="mx-auto h-10 w-10 text-emerald-600 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-emerald-800 font-medium">
            Contract fully signed by both parties
          </p>
          <p className="text-emerald-700 text-sm mt-1">
            Work can now proceed according to the agreed terms
          </p>
        </div>
      )}
    </div>
  );
};
