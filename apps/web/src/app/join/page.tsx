'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { useAuth } from '@/context/auth-context';
import { PolicyDocumentModal } from '@/components/policy-document-modal';
import { ProfessionRegistrationModal } from '@/components/profession-registration-modal';
import { API_BASE_URL } from '@/config/api';

export default function JoinPage() {
  const router = useRouter();
  const { openLoginModal } = useAuthModalControl();
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

  // If user selects client, render the signup flow
  if (showClientFlow) {
    return <ClientSignupFlow onBack={() => setShowClientFlow(false)} />;
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
            <button onClick={openLoginModal} className="font-semibold text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0">
              {navT('login')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientSignupFlow({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const t = useTranslations('auth');
  const navT = useTranslations('nav');
  const commonT = useTranslations('common');
  const { openLoginModal } = useAuthModalControl();
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [preferredContactMethod, setPreferredContactMethod] = useState<'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT'>('EMAIL');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
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

    if (!agreeToTerms) {
      setError('You must agree to the Terms and Conditions to continue');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('validation.passwordMismatch'));
      return;
    }

    if ((preferredContactMethod === 'WHATSAPP' || preferredContactMethod === 'SMS') && !formData.mobile) {
      setError('Mobile number is required when WhatsApp or SMS is selected');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: formData.nickname,
          firstName: formData.firstName,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          preferredContactMethod,
          requireOtpVerification: true,
          password: formData.password,
          role: 'client',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('errors.registrationFailed'));
      }

      const data = await response.json();
      if (data?.otpRequired) {
        setPendingVerificationEmail(formData.email);
      } else {
        router.push('/projects');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingVerificationEmail || !otpCode) {
      setError('Please enter the verification code');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-registration-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerificationEmail, code: otpCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to verify OTP');
      }

      await response.json();
      await login(pendingVerificationEmail, formData.password);
      router.push('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingVerificationEmail) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/resend-registration-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerificationEmail }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to resend OTP');
      }
      alert('Verification code sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pendingVerificationEmail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-blue-200 bg-white shadow-lg p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Verify your account</h1>
              <p className="text-slate-600 text-sm">
                Enter the OTP sent to {pendingVerificationEmail} via {preferredContactMethod === 'WHATSAPP' ? 'WhatsApp' : preferredContactMethod.toLowerCase()}.
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {isSubmitting ? commonT('loading') : 'Verify and continue'}
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 text-slate-700 font-semibold py-2.5 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Resend code
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
              <label className="block text-sm font-medium text-slate-700 mb-2">Primary contact preference</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPreferredContactMethod('EMAIL')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${preferredContactMethod === 'EMAIL' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setPreferredContactMethod('WHATSAPP')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${preferredContactMethod === 'WHATSAPP' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  WhatsApp (active)
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
                >
                  SMS (coming soon)
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
                >
                  WeChat (disabled)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.password')}</label>
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

            {/* Terms and Conditions Checkbox */}
            <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="agreeToTerms"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="agreeToTerms" className="text-sm text-slate-700">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Terms and Conditions
                  </button>
                  {' and acknowledge the '}
                  <button
                    type="button"
                    onClick={() => setShowSecurityModal(true)}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Security Statement
                  </button>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isSubmitting ? commonT('loading') : t('signup.submit')}
            </button>
          </form>

          <div className="text-center text-sm text-slate-600">
            {t('signup.haveAccount')}{' '}
            <button onClick={openLoginModal} className="font-semibold text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0">
              {navT('login')}
            </button>
          </div>
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
    </div>
  );
}
