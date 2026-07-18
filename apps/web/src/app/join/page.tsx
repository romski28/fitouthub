'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { ProfessionRegistrationModal } from '@/components/profession-registration-modal';

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openLoginModal, openJoinModal } = useAuthModalControl();
  const t = useTranslations('auth');
  const navT = useTranslations('nav');
  const [showProfessionalFlow, setShowProfessionalFlow] = useState(false);

  useEffect(() => {
    const role = (searchParams.get('role') || '').toLowerCase();
    if (role === 'client') {
      openJoinModal();
    } else if (role === 'professional') {
      setShowProfessionalFlow(true);
    }
  }, [searchParams, openJoinModal]);

  // If user selects professional, show the profession modal
  if (showProfessionalFlow) {
    return (
      <ProfessionRegistrationModal
        isOpen={true}
        onClose={() => setShowProfessionalFlow(false)}
        onSelect={(professionType) => {
          router.push(`/professional-signup?profession=${professionType}`);
        }}
      />
    );
  }

  // Default: show choice
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">{t('join.title')}</h1>
            <p className="text-slate-600">{t('join.subtitle')}</p>
          </div>

          <div className="space-y-4">
            {/* Client Signup */}
            <button
              onClick={openJoinModal}
              className="w-full rounded-lg border-2 border-blue-200 bg-blue-50 p-6 text-center transition hover:border-blue-400 hover:bg-blue-100"
            >
              <div className="text-3xl mb-2">👤</div>
              <h2 className="text-lg font-semibold text-blue-900 mb-1">{t('join.clientTitle')}</h2>
              <p className="text-sm text-blue-800">{t('join.clientDescription')}</p>
            </button>

            {/* Professional Signup */}
            <button
              onClick={() => setShowProfessionalFlow(true)}
              className="w-full rounded-lg border-2 border-purple-200 bg-purple-50 p-6 text-center transition hover:border-purple-400 hover:bg-purple-100"
            >
              <div className="text-3xl mb-2">👷</div>
              <h2 className="text-lg font-semibold text-purple-900 mb-1">{t('join.professionalTitle')}</h2>
              <p className="text-sm text-purple-800">{t('join.professionalDescription')}</p>
            </button>
          </div>

          <div className="text-center text-sm text-slate-600">
            {t('signup.haveAccount')}{' '}
            <button onClick={openLoginModal} className="font-semibold text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0">
              {navT('login')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
