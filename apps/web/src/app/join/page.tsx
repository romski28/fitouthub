'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProfessionRegistrationModal } from '@/components/profession-registration-modal';

export default function JoinPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const navT = useTranslations('nav');
  const [showClientFlow, setShowClientFlow] = useState(false);
  const [showProfessionalFlow, setShowProfessionalFlow] = useState(false);

  // If user selects professional, show the profession modal
  if (showProfessionalFlow) {
    return (
      <ProfessionRegistrationModal
        isOpen={true}
        onClose={() => setShowProfessionalFlow(false)}
        onSelect={(professionType) => {
          // After selecting profession, redirect to professional signup
          router.push(`/professional-signup?profession=${professionType}`);
        }}
      />
    );
  }

  // If user selects client, redirect to client signup
  if (showClientFlow) {
    return <ClientSignupFlow />;
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
              onClick={() => setShowClientFlow(true)}
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
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              {navT('login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientSignupFlow() {
  const router = useRouter();
  const t = useTranslations('auth');
  const commonT = useTranslations('common');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nickname: '',
    firstName: '',
    surname: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError(t('validation.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: formData.nickname,
          firstName: formData.firstName,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          password: formData.password,
          role: 'client',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('errors.registrationFailed'));
      }

      router.push('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-blue-200 bg-white shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">{t('signup.title')}</h1>
            <p className="text-slate-600">{t('signup.intro')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.username')}</label>
              <input
                type="text"
                autoComplete="off"
                required
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.firstName')}</label>
                <input
                  type="text"
                  autoComplete="off"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.lastName')}</label>
                <input
                  type="text"
                  autoComplete="off"
                  required
                  value={formData.surname}
                  onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.email')}</label>
              <input
                type="email"
                autoComplete="off"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('signup.mobile')} ({commonT('optional')})
              </label>
              <input
                type="tel"
                autoComplete="off"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('login.password')}</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.confirmPassword')}</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isSubmitting ? t('common.loading') : t('signup.submit')}
            </button>
          </form>

          <div className="text-center text-sm text-slate-600">
            {t('login.haveAccount')}{' '}
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              {t('nav.login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
