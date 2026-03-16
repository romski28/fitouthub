'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { PolicyDocumentModal } from '@/components/policy-document-modal';
import { API_BASE_URL } from '@/config/api';
import confetti from 'canvas-confetti';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'join';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'login',
}) => {
  const t = useTranslations('auth');
  const modalT = useTranslations('auth.modal');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const { login, register } = useAuth();
  const { login: loginProfessional, register: registerProfessional } = useProfessionalAuth();
  const pageLanguage = locale === 'zh-HK' ? 'zh-HK' : 'en';
  const [activeTab, setActiveTab] = useState<'login' | 'join'>(defaultTab);
  const [userType, setUserType] = useState<'client' | 'professional'>('client');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [clientAgreeToTerms, setClientAgreeToTerms] = useState(false);
  const [professionalAgreeToTerms, setProfessionalAgreeToTerms] = useState(false);
  const [clientAllowPartnerOffers, setClientAllowPartnerOffers] = useState(false);
  const [clientAllowPlatformUpdates, setClientAllowPlatformUpdates] = useState(true);
  const [professionalAllowPartnerOffers, setProfessionalAllowPartnerOffers] = useState(false);
  const [professionalAllowPlatformUpdates, setProfessionalAllowPlatformUpdates] = useState(true);
  const [clientPreferredContact, setClientPreferredContact] = useState<'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT'>('EMAIL');
  const [professionalPreferredContact, setProfessionalPreferredContact] = useState<'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT'>('EMAIL');
  const [clientPreferredLanguage, setClientPreferredLanguage] = useState<'en' | 'zh-HK'>(pageLanguage);
  const [professionalPreferredLanguage, setProfessionalPreferredLanguage] = useState<'en' | 'zh-HK'>(pageLanguage);
  const [professionType, setProfessionType] = useState<string>('general');
  const [pendingVerification, setPendingVerification] = useState<{
    email: string;
    userType: 'client' | 'professional';
  } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Clear form fields when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setLoginEmail('');
      setLoginPassword('');
      setError(null);
      setClientAgreeToTerms(false);
      setProfessionalAgreeToTerms(false);
      setClientAllowPartnerOffers(false);
      setClientAllowPlatformUpdates(true);
      setProfessionalAllowPartnerOffers(false);
      setProfessionalAllowPlatformUpdates(true);
      setClientPreferredContact('EMAIL');
      setProfessionalPreferredContact('EMAIL');
      setClientPreferredLanguage(pageLanguage);
      setProfessionalPreferredLanguage(pageLanguage);
      setProfessionType('general');
      setPendingVerification(null);
      setOtpCode('');
      setVerificationSuccess(false);
      setClientForm({
        nickname: '',
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        surname: '',
        mobile: '',
      });
      setProfessionalForm({
        businessName: '',
        contactName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
      });
    }
  }, [isOpen, pageLanguage]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Client registration state
  const [clientForm, setClientForm] = useState({
    nickname: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    surname: '',
    mobile: '',
  });

  // Professional registration state
  const [professionalForm, setProfessionalForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (userType === 'professional') {
        await loginProfessional(loginEmail, loginPassword);
      } else {
        await login(loginEmail, loginPassword);
      }
      onClose();
      setLoginEmail('');
      setLoginPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClientRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientAgreeToTerms) {
      setError(modalT('termsRequired'));
      return;
    }

    if (clientForm.password !== clientForm.confirmPassword) {
        setError(modalT('passwordMismatch'));
        return;
    }

    setLoading(true);
    try {
      const result = await register({
        nickname: clientForm.nickname,
        email: clientForm.email,
        password: clientForm.password,
        firstName: clientForm.firstName,
        surname: clientForm.surname,
        mobile: clientForm.mobile || undefined,
        role: 'client',
        preferredContactMethod: clientPreferredContact,
        preferredLanguage: clientPreferredLanguage,
        allowPartnerOffers: clientAllowPartnerOffers,
        allowPlatformUpdates: clientAllowPlatformUpdates,
        requireOtpVerification: true,
      });

      if ('otpRequired' in result && result.otpRequired) {
        setPendingVerification({
          email: result.email || clientForm.email,
          userType: 'client',
        });
        setOtpCode('');
        return;
      }

      onClose();
      setClientForm({
        nickname: '',
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        surname: '',
        mobile: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleProfessionalRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!professionalAgreeToTerms) {
      setError(modalT('termsRequired'));
      return;
    }

    if (professionalForm.password !== professionalForm.confirmPassword) {
        setError(modalT('passwordMismatch'));
        return;
    }

    setLoading(true);
    try {
      const result = await registerProfessional({
        businessName: professionalForm.businessName,
        fullName: professionalForm.contactName,
        email: professionalForm.email,
        password: professionalForm.password,
        phone: professionalForm.phone,
        professionType: professionType,
        preferredContactMethod: professionalPreferredContact,
        preferredLanguage: professionalPreferredLanguage,
        allowPartnerOffers: professionalAllowPartnerOffers,
        allowPlatformUpdates: professionalAllowPlatformUpdates,
        requireOtpVerification: true,
      });

      if ('otpRequired' in result && result.otpRequired) {
        setPendingVerification({
          email: result.email || professionalForm.email,
          userType: 'professional',
        });
        setOtpCode('');
        return;
      }

      onClose();
      setProfessionalForm({
        businessName: '',
        contactName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pendingVerification || !otpCode) {
      setError(modalT('enterVerificationCode'));
      return;
    }

    setLoading(true);
    try {
      const endpoint = pendingVerification.userType === 'professional'
        ? `${API_BASE_URL}/professional/auth/verify-registration-otp`
        : `${API_BASE_URL}/auth/verify-registration-otp`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerification.email, code: otpCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || modalT('otpVerificationFailed'));
      }

      // Show success banner and trigger confetti
      setVerificationSuccess(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
      });

      // Auto-login and close after 2.5 seconds
      setTimeout(async () => {
        try {
          if (pendingVerification.userType === 'professional') {
            await loginProfessional(professionalForm.email, professionalForm.password);
          } else {
            await login(clientForm.email, clientForm.password);
          }

          setPendingVerification(null);
          setOtpCode('');
          setVerificationSuccess(false);
          onClose();
        } catch (loginErr) {
          setError(loginErr instanceof Error ? loginErr.message : modalT('loginFailed'));
          setVerificationSuccess(false);
        }
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('otpVerificationFailed'));
      setVerificationSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);

    if (!pendingVerification) {
      return;
    }

    setLoading(true);
    try {
      const endpoint = pendingVerification.userType === 'professional'
        ? `${API_BASE_URL}/professional/auth/resend-registration-otp`
        : `${API_BASE_URL}/auth/resend-registration-otp`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerification.email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || modalT('otpResendFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('otpResendFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 py-12 px-4 sm:px-6 lg:px-8"
      onClick={handleBackdropClick}
      onMouseDown={(e) => {
        // Prevent propagation from inner elements
        if (e.target !== e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <div 
        className="w-full max-w-md rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-2xl font-bold text-gray-900">
            {activeTab === 'login' ? modalT('signIn') : modalT('join')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
            aria-label={modalT('closeModal')}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => {
              setActiveTab('login');
              setError(null);
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'login'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {modalT('login')}
          </button>
          <button
            onClick={() => {
              setActiveTab('join');
              setError(null);
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'join'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {modalT('join')}
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {activeTab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* User Type Toggle for Login */}
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUserType('client')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    userType === 'client'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {modalT('client')}
                </button>
                <button
                  type="button"
                  onClick={() => setUserType('professional')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    userType === 'professional'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {modalT('professional')}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t('login.email')}
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('login.password')}
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? modalT('loading') : modalT('login')}
              </button>
            </form>
          ) : (
            <>
              {!pendingVerification && (
                <div className="mb-6 flex gap-2 bg-gray-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setUserType('client')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      userType === 'client'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    👤 {modalT('client')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('professional')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      userType === 'professional'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    👷 {modalT('professional')}
                  </button>
                </div>
              )}

              {verificationSuccess ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="text-5xl animate-bounce">🎉</div>
                  <h3 className="text-2xl font-bold text-gray-900">{modalT('welcomeVerified')}</h3>
                  <p className="text-center text-gray-600">
                    {modalT('verifiedLoggingIn')}
                  </p>
                  <div className="w-full bg-gradient-to-r from-blue-500 to-green-500 h-1 rounded-full animate-pulse"></div>
                </div>
              ) : pendingVerification ? (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
                    {modalT('otpSentTo', { email: pendingVerification.email })}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {modalT('verificationCode')}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? modalT('verifyingOtp') : modalT('verifyOtp')}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-700 font-medium hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    {modalT('resendCode')}
                  </button>
                </form>
              ) : userType === 'client' ? (
                <form
                  onSubmit={handleClientRegister}
                  className="space-y-4 max-h-96 overflow-y-auto"
                  autoComplete="off"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.username')}
                    </label>
                    <input
                      type="text"
                      value={clientForm.nickname}
                      onChange={(e) => setClientForm({ ...clientForm, nickname: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.email')}
                    </label>
                    <input
                      type="email"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        {t('signup.firstName')}
                      </label>
                      <input
                        type="text"
                        value={clientForm.firstName}
                        onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })}
                        required
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        {t('signup.surname')}
                      </label>
                      <input
                        type="text"
                        value={clientForm.surname}
                        onChange={(e) => setClientForm({ ...clientForm, surname: e.target.value })}
                        required
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.mobile')} ({commonT('optional')})
                    </label>
                    <input
                      type="tel"
                      value={clientForm.mobile}
                      onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.password')}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={clientForm.password}
                      onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.confirmPassword')}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={clientForm.confirmPassword}
                      onChange={(e) => setClientForm({ ...clientForm, confirmPassword: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {modalT('primaryContactPreference')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setClientPreferredContact('EMAIL')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${clientPreferredContact === 'EMAIL' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {modalT('contactEmail')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientPreferredContact('WHATSAPP')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${clientPreferredContact === 'WHATSAPP' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {modalT('contactWhatsapp')}
                      </button>
                      <button
                        type="button"
                        disabled
                        className="rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
                      >
                        {modalT('contactSmsComing')}
                      </button>
                      <button
                        type="button"
                        disabled
                        className="rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
                      >
                        {modalT('contactWeChatDisabled')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {modalT('preferredLanguage')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setClientPreferredLanguage('zh-HK')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${clientPreferredLanguage === 'zh-HK' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        🇭🇰 {modalT('languageCantonese')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientPreferredLanguage('en')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${clientPreferredLanguage === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        🇬🇧 {modalT('languageEnglish')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="clientAllowPartnerOffers"
                        checked={clientAllowPartnerOffers}
                        onChange={(e) => setClientAllowPartnerOffers(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="clientAllowPartnerOffers" className="text-xs text-gray-700">
                        {modalT('partnerOffers')}
                      </label>
                    </div>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="clientAllowPlatformUpdates"
                        checked={clientAllowPlatformUpdates}
                        onChange={(e) => setClientAllowPlatformUpdates(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="clientAllowPlatformUpdates" className="text-xs text-gray-700">
                        {modalT('platformUpdates')}
                      </label>
                    </div>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="clientAgreeToTerms"
                        checked={clientAgreeToTerms}
                        onChange={(e) => setClientAgreeToTerms(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="clientAgreeToTerms" className="text-xs text-gray-700">
                        {modalT('agreePrefix')}{' '}
                        <button
                          type="button"
                          onClick={() => setShowTermsModal(true)}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          {modalT('termsAndConditions')}
                        </button>
                        {' '}{modalT('agreeMiddle')}{' '}
                        <button
                          type="button"
                          onClick={() => setShowSecurityModal(true)}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          {modalT('securityStatement')}
                        </button>
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? modalT('creatingAccount') : modalT('createAccount')}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={handleProfessionalRegister}
                  className="space-y-4 max-h-96 overflow-y-auto"
                  autoComplete="off"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {modalT('companyName')}
                    </label>
                    <input
                      type="text"
                      value={professionalForm.businessName}
                      onChange={(e) => setProfessionalForm({ ...professionalForm, businessName: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {modalT('contactName')}
                    </label>
                    <input
                      type="text"
                      value={professionalForm.contactName}
                      onChange={(e) => setProfessionalForm({ ...professionalForm, contactName: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.email')}
                    </label>
                    <input
                      type="email"
                      value={professionalForm.email}
                      onChange={(e) => setProfessionalForm({ ...professionalForm, email: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {modalT('phone')}
                    </label>
                    <input
                      type="tel"
                      value={professionalForm.phone}
                      onChange={(e) => setProfessionalForm({ ...professionalForm, phone: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {modalT('professionType')}
                    </label>
                    <select
                      value={professionType}
                      onChange={(e) => setProfessionType(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    >
                      <option value="general">{modalT('professionGeneral')}</option>
                      <option value="electrician">{modalT('professionElectrician')}</option>
                      <option value="plumber">{modalT('professionPlumber')}</option>
                      <option value="carpenter">{modalT('professionCarpenter')}</option>
                      <option value="painter">{modalT('professionPainter')}</option>
                      <option value="contractor">{modalT('professionContractor')}</option>
                      <option value="hvac">{modalT('professionHvac')}</option>
                      <option value="other">{modalT('professionOther')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {modalT('preferredContactMethod')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setProfessionalPreferredContact('EMAIL')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${professionalPreferredContact === 'EMAIL' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {modalT('contactEmail')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfessionalPreferredContact('WHATSAPP')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${professionalPreferredContact === 'WHATSAPP' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {modalT('contactWhatsapp')}
                      </button>
                      <button
                        type="button"
                        disabled
                        className="rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
                      >
                        {modalT('contactSmsComing')}
                      </button>
                      <button
                        type="button"
                        disabled
                        className="rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
                      >
                        {modalT('contactWeChatDisabled')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {modalT('preferredLanguage')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setProfessionalPreferredLanguage('zh-HK')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${professionalPreferredLanguage === 'zh-HK' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        🇭🇰 {modalT('languageCantonese')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfessionalPreferredLanguage('en')}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${professionalPreferredLanguage === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        🇬🇧 {modalT('languageEnglish')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.password')}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={professionalForm.password}
                      onChange={(e) => setProfessionalForm({ ...professionalForm, password: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('signup.confirmPassword')}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={professionalForm.confirmPassword}
                      onChange={(e) => setProfessionalForm({ ...professionalForm, confirmPassword: e.target.value })}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="professionalAllowPartnerOffers"
                        checked={professionalAllowPartnerOffers}
                        onChange={(e) => setProfessionalAllowPartnerOffers(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="professionalAllowPartnerOffers" className="text-xs text-gray-700">
                        {modalT('partnerOffers')}
                      </label>
                    </div>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="professionalAllowPlatformUpdates"
                        checked={professionalAllowPlatformUpdates}
                        onChange={(e) => setProfessionalAllowPlatformUpdates(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="professionalAllowPlatformUpdates" className="text-xs text-gray-700">
                        {modalT('platformUpdates')}
                      </label>
                    </div>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="professionalAgreeToTerms"
                        checked={professionalAgreeToTerms}
                        onChange={(e) => setProfessionalAgreeToTerms(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="professionalAgreeToTerms" className="text-xs text-gray-700">
                        {modalT('agreePrefix')}{' '}
                        <button
                          type="button"
                          onClick={() => setShowTermsModal(true)}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          {modalT('termsAndConditions')}
                        </button>
                        {' '}{modalT('agreeMiddle')}{' '}
                        <button
                          type="button"
                          onClick={() => setShowSecurityModal(true)}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          {modalT('securityStatement')}
                        </button>
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? modalT('creatingAccount') : modalT('createAccount')}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Modals */}
        <PolicyDocumentModal
          isOpen={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          title={modalT('termsAndConditions')}
          policyType="TERMS_AND_CONDITIONS"
        />
        <PolicyDocumentModal
          isOpen={showSecurityModal}
          onClose={() => setShowSecurityModal(false)}
          title={modalT('securityStatement')}
          policyType="SECURITY_STATEMENT"
        />
      </div>
    </div>
  );
};
