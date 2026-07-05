'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Script from 'next/script';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { PolicyDocumentModal } from '@/components/policy-document-modal';
import { API_BASE_URL } from '@/config/api';
import confetti from 'canvas-confetti';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: 'outline' | 'filled_blue' | 'filled_black';
              size: 'large' | 'medium' | 'small';
              width?: number;
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
            },
          ) => void;
        };
      };
    };
  }
}

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
  const router = useRouter();
  const { login, register, googleLogin } = useAuth();
  const { login: loginProfessional, register: registerProfessional, googleLogin: googleLoginProfessional } = useProfessionalAuth();
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
  const [professionType, setProfessionType] = useState<'company' | 'contractor' | 'reseller'>('company');
  const [professionalEmergencyCallout, setProfessionalEmergencyCallout] = useState(false);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [availablePersonas, setAvailablePersonas] = useState<{ id: string; type: string }[]>([]);
  const [pendingVerification, setPendingVerification] = useState<{
    email: string;
    userType: 'client' | 'professional';
  } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'google'>('email');
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);
  const googleContainerRef = React.useRef<HTMLDivElement | null>(null);
  const shouldShowJoinShortcut =
    activeTab === 'login' &&
    loginMethod === 'google' &&
    typeof error === 'string' &&
    error.toLowerCase().includes('please join first');

  const getPostLoginPath = (role?: string | null, hasProfessional?: boolean) => {
    if (hasProfessional) return '/professional-projects';
    const normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole === 'surveyor' || normalizedRole === 'mimo_boh') {
      return '/survey-ops';
    }
    return '/projects';
  };

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
      setProfessionType('company');
      setProfessionalEmergencyCallout(false);
      setPendingVerification(null);
      setOtpCode('');
      setVerificationSuccess(false);
      setLoginMethod('email');
      setGoogleButtonRendered(false);
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
      const result = await login(loginEmail, loginPassword);

      if (result.requiresPersonaSelection) {
        setAvailablePersonas(result.personas ?? []);
        setShowPersonaPicker(true);
        setLoading(false);
        return;
      }

      const postLoginPath = getPostLoginPath(result.user?.role, !!result.professional);

      // If professional login, also seed professional localStorage
      if (result.professional && result.accessToken) {
        localStorage.setItem('professionalAccessToken', result.accessToken);
        localStorage.setItem('professionalRefreshToken', result.refreshToken || '');
        localStorage.setItem('professional', JSON.stringify(result.professional));
      }

      onClose();
      setLoginEmail('');
      setLoginPassword('');
      setShowPersonaPicker(false);
      if (postLoginPath) router.push(postLoginPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePersonaSelect = async (personaId: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await login(loginEmail, loginPassword, personaId);
      const postLoginPath = getPostLoginPath(result.user?.role, !!result.professional);

      // If professional login, also seed professional localStorage
      if (result.professional && result.accessToken) {
        localStorage.setItem('professionalAccessToken', result.accessToken);
        localStorage.setItem('professionalRefreshToken', result.refreshToken || '');
        localStorage.setItem('professional', JSON.stringify(result.professional));
      }

      onClose();
      setLoginEmail('');
      setLoginPassword('');
      setShowPersonaPicker(false);
      setAvailablePersonas([]);
      if (postLoginPath) router.push(postLoginPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : modalT('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = React.useCallback(async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      if (userType === 'professional') {
        await googleLoginProfessional(credential);
        onClose();
      } else {
        const result = await googleLogin(credential);
        const postLoginPath = getPostLoginPath(result?.user?.role);
        onClose();
        if (postLoginPath) {
          router.push(postLoginPath);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }, [googleLogin, googleLoginProfessional, onClose, router, userType]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== 'login' || loginMethod !== 'google') return;
    setGoogleButtonRendered(false);

    const timer = window.setTimeout(() => {
      if (!googleScriptReady || !googleContainerRef.current) return;
      if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        setError('Google is not configured yet. Please add NEXT_PUBLIC_GOOGLE_CLIENT_ID.');
        return;
      }
      if (!window.google?.accounts?.id) return;

      googleContainerRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (!response.credential) {
            setError('Google did not return a credential. Please try again.');
            return;
          }
          void handleGoogleCredential(response.credential);
        },
      });

      window.google.accounts.id.renderButton(googleContainerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
      });
      setGoogleButtonRendered(true);
    }, 50);

    return () => window.clearTimeout(timer);
  }, [isOpen, activeTab, loginMethod, userType, googleScriptReady, handleGoogleCredential]);

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
        emergencyCalloutAvailable: professionalEmergencyCallout,
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
          let postLoginPath: string | null = null;
          if (pendingVerification.userType === 'professional') {
            await loginProfessional(professionalForm.email, professionalForm.password);
          } else {
            const result = await login(clientForm.email, clientForm.password);
            postLoginPath = getPostLoginPath(result?.user?.role);
          }

          setPendingVerification(null);
          setOtpCode('');
          setVerificationSuccess(false);
          onClose();
          if (postLoginPath) {
            router.push(postLoginPath);
          }
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
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleScriptReady(true)}
      />

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
        className="w-full max-w-2xl rounded-lg bg-[#F7F0E1] shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            {activeTab === 'login' ? (
              <>
                <Image
                  src="/assets/images/chatbot-avatar-icon.png"
                  alt="Chat avatar"
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full"
                />
                <span>Hi, welcome back</span>
              </>
            ) : (
              modalT('join')
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
            aria-label={modalT('closeModal')}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
              {shouldShowJoinShortcut && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('join');
                      setError(null);
                    }}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Start join flow
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {showPersonaPicker ? (
                <>
                  <p className="text-center text-sm font-semibold text-slate-700">Choose your account</p>
                  <div className="space-y-2">
                    {availablePersonas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePersonaSelect(p.id)}
                        disabled={loading}
                        className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 hover:bg-emerald-100 transition disabled:opacity-50"
                      >
                        {p.type === 'CLIENT' ? '🏠 Client' : p.type === 'PROFESSIONAL' ? '🔧 Professional' : `👤 ${p.type}`}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowPersonaPicker(false); setAvailablePersonas([]); }}
                    className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
                  >
                    ← Back
                  </button>
                </>
              ) : (
                <>
              <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Sign in</p>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('google');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    loginMethod === 'google'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('email');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    loginMethod === 'email'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Email
                </button>
              </div>

              <div className="min-h-[220px]">
                {loginMethod === 'google' ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex h-[44px] items-center justify-center">
                      <div ref={googleContainerRef} className="flex h-[44px] w-[320px] items-center justify-center" />
                    </div>
                    <p className="mt-2 h-4 text-center text-xs text-gray-500">
                      {googleScriptReady && !googleButtonRendered ? 'Loading Google button...' : '\u00A0'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {loading ? modalT('loading') : modalT('login')}
                    </button>
                  </>
                )}
              </div>
              </>
              )}
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
                        ? 'bg-[#0E7C3A] text-white shadow-sm'
                        : 'bg-[#F3F4F6] text-gray-600 hover:bg-[#E5E7EB] hover:text-gray-900'
                    }`}
                  >
                    👤 {modalT('client')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('professional')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      userType === 'professional'
                        ? 'bg-[#0E7C3A] text-white shadow-sm'
                        : 'bg-[#F3F4F6] text-gray-600 hover:bg-[#E5E7EB] hover:text-gray-900'
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
                    disabled={loading || !clientAgreeToTerms}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {modalT('joinAs')}
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => setProfessionType('company')}
                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${professionType === 'company' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        <p className="font-semibold">{modalT('joinAsCompany')}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{modalT('joinAsCompanyDesc')}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfessionType('contractor')}
                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${professionType === 'contractor' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        <p className="font-semibold">{modalT('joinAsContractor')}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{modalT('joinAsContractorDesc')}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfessionType('reseller')}
                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${professionType === 'reseller' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        <p className="font-semibold">{modalT('joinAsReseller')}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{modalT('joinAsResellerDesc')}</p>
                      </button>
                    </div>
                  </div>

                  {(professionType === 'contractor' || professionType === 'company') && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <input
                        type="checkbox"
                        id="professionalEmergencyCallout"
                        checked={professionalEmergencyCallout}
                        onChange={(e) => setProfessionalEmergencyCallout(e.target.checked)}
                        className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="professionalEmergencyCallout" className="text-sm text-gray-700">
                        Emergency call out available 24/7
                      </label>
                    </div>
                  )}

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
                    disabled={loading || !professionalAgreeToTerms}
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
    </>
  );
};
