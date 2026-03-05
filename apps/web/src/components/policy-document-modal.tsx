'use client';

import React, { useEffect, useState } from 'react';
import { DocumentModal } from './document-modal';
import { getPolicyContent, PolicyType } from '@/lib/policies';

interface PolicyDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyType: PolicyType;
  title: string;
}

/**
 * PolicyDocumentModal - Fetches policy content from API and displays in modal
 * This replaces direct usage of DocumentModal with hardcoded content
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
        console.error('Error loading policy:', err);
        if (!cancelled) {
          setContent('Failed to load document. Please try again.');
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
