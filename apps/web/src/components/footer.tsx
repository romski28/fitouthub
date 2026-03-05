'use client';

import { useState } from 'react';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { DocumentModal } from '@/components/document-modal';
import { useTranslations } from 'next-intl';
import { TERMS_AND_CONDITIONS } from '@/content/terms-and-conditions';
import { SECURITY_STATEMENT } from '@/content/security-statement';

export default function Footer() {
  const t = useTranslations('footer');
  const currentYear = new Date().getFullYear();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300 mt-16">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Fitout Hub</h3>
            <p className="text-sm">
              {t('description')}
            </p>
          </div>

          {/* Browse */}
          <div className="space-y-4">
            <h4 className="font-semibold text-white">{t('browse')}</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/professionals" className="hover:text-white transition">{t('professionals')}</a></li>
              <li><a href="/tradesmen" className="hover:text-white transition">{t('tradesmen')}</a></li>
            </ul>
          </div>

          {/* For Clients */}
          <div className="space-y-4">
            <h4 className="font-semibold text-white">{t('forClients')}</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={openJoinModal} className="hover:text-white transition text-left">{t('getStarted')}</button></li>
              <li><a href="/create-project" className="hover:text-white transition">{t('createProject')}</a></li>
            </ul>
          </div>

          {/* Account */}
          <div className="space-y-4">
            <h4 className="font-semibold text-white">{t('account')}</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={openLoginModal} className="hover:text-white transition text-left">{t('login')}</button></li>
              <li><button onClick={openJoinModal} className="hover:text-white transition text-left">{t('join')}</button></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-700 pt-8 flex flex-col md:flex-row justify-between items-center text-sm">
          <p>{t('copyright', { year: currentYear })}</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <button onClick={() => setShowTermsModal(true)} className="hover:text-white transition">Terms & Conditions</button>
            <button onClick={() => setShowSecurityModal(true)} className="hover:text-white transition">Security</button>
            <a href="#" className="hover:text-white transition">{t('twitter')}</a>
            <a href="#" className="hover:text-white transition">{t('linkedin')}</a>
            <a href="#" className="hover:text-white transition">{t('instagram')}</a>
          </div>
        </div>
      </div>

      {/* Modals */}
      <DocumentModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Terms and Conditions"
        content={TERMS_AND_CONDITIONS}
      />
      <DocumentModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        title="Security Statement"
        content={SECURITY_STATEMENT}
      />
    </footer>
  );
}
