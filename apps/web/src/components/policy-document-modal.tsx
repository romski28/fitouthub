'use client';

import React, { useEffect, useState } from 'react';
import { DocumentModal } from './document-modal';
import { getPolicyContent, PolicyType } from '@/lib/policies';
import { TERMS_AND_CONDITIONS } from '@/content/terms-and-conditions';
import { SECURITY_STATEMENT } from '@/content/security-statement';

interface PolicyDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyType: PolicyType;
  title: string;
}

/**
 * PolicyDocumentModal - Fetches policy content from API and displays in modal
 * Falls back to hardcoded content if API is unavailable (e.g., migrations not run yet)
 */
export const PolicyDocumentModal: React.FC<PolicyDocumentModalProps> = ({
  isOpen,
  onClose,
  policyType,
  title,
}) => {
  const [content, setContent] = useState<string>('Loading document...');

  useEffect(() => {
    if (!isOpen) return;
    
    let cancelled = false;

    async function loadPolicy() {
      try {
        const policyContent = await getPolicyContent(policyType);
        if (!cancelled) {
          setContent(policyContent);
        }
      } catch (err) {
        console.warn('Error loading policy from API, using fallback:', err);
        if (!cancelled) {
          // Fallback to hardcoded content if API fails (e.g., migrations not run yet)
          const fallbackContent = getFallbackContent(policyType);
          setContent(fallbackContent);
        }
      }
    }

    loadPolicy();

    return () => {
      cancelled = true;
    };
  }, [isOpen, policyType]);

  if (!isOpen) return null;

  return (
    <DocumentModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      content={content}
    />
  );
};

/**
 * Fallback content for when API is unavailable
 */
function getFallbackContent(type: PolicyType): string {
  switch (type) {
    case 'TERMS_AND_CONDITIONS':
      return TERMS_AND_CONDITIONS;
    case 'SECURITY_STATEMENT':
      return SECURITY_STATEMENT;
    case 'CONTRACT_TEMPLATE':
      return 'Contract template is being loaded...';
    default:
      return 'Document content unavailable. Please try again later.';
  }
}
