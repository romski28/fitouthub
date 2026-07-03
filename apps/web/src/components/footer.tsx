'use client';

import { useState } from 'react';
import { PolicyDocumentModal } from '@/components/policy-document-modal';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');
  const currentYear = new Date().getFullYear();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  return (
    <footer className="border-t border-slate-200 bg-white text-slate-500 mt-16">
      <div className="mx-auto max-w-6xl px-6 py-4 flex flex-col md:flex-row justify-between items-center text-sm">
        <p>{t('copyright', { year: currentYear })}</p>
        <div className="flex gap-6 mt-2 md:mt-0">
          <button onClick={() => setShowTermsModal(true)} className="hover:text-slate-900 transition">Terms &amp; Conditions</button>
          <button onClick={() => setShowSecurityModal(true)} className="hover:text-slate-900 transition">Security</button>
          <a href="#" className="hover:text-slate-900 transition">{t('twitter')}</a>
          <a href="#" className="hover:text-slate-900 transition">{t('linkedin')}</a>
          <a href="#" className="hover:text-slate-900 transition">{t('instagram')}</a>
        </div>
      </div>

      {/* Modals */}
      <PolicyDocumentModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Terms and Conditions"
        policyType="TERMS_AND_CONDITIONS"
      />
      <PolicyDocumentModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        title="Security Statement"
        policyType="SECURITY_STATEMENT"
      />
    </footer>
  );
}
