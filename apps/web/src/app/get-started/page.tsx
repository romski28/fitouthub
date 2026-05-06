'use client';

import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { PolicyDocumentModal } from '@/components/policy-document-modal';

type Role = 'client' | 'professional';
type SignInMethod = 'email' | 'google' | null;

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

type ClientSessionResult = {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
};

type ProfessionalSessionResult = {
  accessToken: string;
  refreshToken: string;
  professional: Record<string, unknown>;
};

function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

const stepsByRole: Record<Role, string[]> = {
  client: ['Sign in method', 'About you', 'Nickname and preferences'],
  professional: ['Sign in method', 'Your business', 'Contact and availability', 'Your account', 'Terms and verification'],
};

export default function GetStartedPage() {
  const router = useRouter();
  const { openLoginModal } = useAuthModalControl();
  const { login: clientLogin } = useAuth();
  const { login: professionalLogin } = useProfessionalAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleChosenMoment, setRoleChosenMoment] = useState(false);
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<SignInMethod>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [pendingOtp, setPendingOtp] = useState<null | { email: string; role: Role; password?: string }> (null);
  const [otpCode, setOtpCode] = useState('');
  const [googleOnboardingToken, setGoogleOnboardingToken] = useState<string | null>(null);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);
  const googleContainerRef = useRef<HTMLDivElement | null>(null);

  const [clientForm, setClientForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    surname: '',
    nickname: '',
    mobile: '',
    preferredLanguage: 'en',
    preferredContactMethod: 'EMAIL' as 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT',
    allowPartnerOffers: false,
    allowPlatformUpdates: true,
    agreeToTerms: false,
    agreeToSecurity: false,
  });

  const [professionalForm, setProfessionalForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    businessName: '',
    professionType: 'company',
    phone: '',
    nickname: '',
    preferredLanguage: 'en',
    preferredContactMethod: 'EMAIL' as 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT',
    emergencyCalloutAvailable: false,
    allowPartnerOffers: false,
    allowPlatformUpdates: true,
    agreeToTerms: false,
    agreeToSecurity: false,
  });

  const dots = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        top: `${(i * 29) % 100}%`,
        delay: `${(i % 7) * 0.3}s`,
      })),
    [],
  );

  const totalSteps = role ? stepsByRole[role].length : 0;
  const progressPercent = role ? ((step + 1) / totalSteps) * 100 : 0;
  const canRenderGoogle = role && step === 0;

  const saveClientSession = (result: ClientSessionResult) => {
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    window.location.href = '/projects';
  };

  const saveProfessionalSession = (result: ProfessionalSessionResult) => {
    localStorage.setItem('professionalAccessToken', result.accessToken);
    localStorage.setItem('professionalRefreshToken', result.refreshToken || '');
    localStorage.setItem('professional', JSON.stringify(result.professional));
    window.location.href = '/professional-projects';
  };

  const handleGoogleCredential = async (credential: string) => {
    if (!role) return;
    setLoading(true);
    setError(null);
    try {
      const startEndpoint =
        role === 'client'
          ? `${API_BASE_URL}/auth/oauth/google/start`
          : `${API_BASE_URL}/professional/auth/oauth/google/start`;

      const response = await fetch(startEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: credential }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Google sign-in failed');
      }

      if (data.existingUser) {
        if (role === 'client') saveClientSession(data);
        else saveProfessionalSession(data);
        return;
      }

      if (data.onboardingRequired) {
        setGoogleOnboardingToken(data.onboardingToken);
        setMethod('google');
        if (role === 'client') {
          setClientForm((prev) => ({
            ...prev,
            email: data.profile?.email || prev.email,
            firstName: data.profile?.firstName || prev.firstName,
            surname: data.profile?.surname || prev.surname,
          }));
          setStep(1);
        } else {
          setProfessionalForm((prev) => ({
            ...prev,
            email: data.profile?.email || prev.email,
            fullName: data.profile?.fullName || prev.fullName,
          }));
          setStep(1);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const renderGoogleButton = () => {
    if (!googleScriptReady || !canRenderGoogle || !googleContainerRef.current || !role) return;
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
      width: 340,
      text: 'continue_with',
      shape: 'pill',
    });
    setGoogleButtonRendered(true);
  };

  const handleChooseRole = (nextRole: Role) => {
    setRole(nextRole);
    setRoleChosenMoment(true);
    setStep(0);
    setMethod(null);
    setGoogleOnboardingToken(null);
    setError(null);
    setGoogleButtonRendered(false);
    setTimeout(() => setRoleChosenMoment(false), 700);
  };

  const validateCurrentStep = (): string | null => {
    if (!role) return 'Choose your path to continue.';

    if (role === 'client') {
      if (step === 0) {
        if (!method) return 'Choose email or Google to continue.';
        if (method === 'email') {
          if (!clientForm.email || !clientForm.password || !clientForm.confirmPassword) {
            return 'Email and password fields are required.';
          }
          if (clientForm.password !== clientForm.confirmPassword) {
            return 'Passwords do not match.';
          }
        }
      }
      if (step === 1) {
        if (!clientForm.firstName || !clientForm.surname) {
          return 'First name and surname are required.';
        }
        if (
          (clientForm.preferredContactMethod === 'WHATSAPP' ||
            clientForm.preferredContactMethod === 'SMS') &&
          !clientForm.mobile
        ) {
          return 'Mobile is required when WhatsApp or SMS is selected.';
        }
      }
      if (step === 2) {
        if (!clientForm.nickname) return 'Nickname is required.';
        if (!clientForm.agreeToTerms || !clientForm.agreeToSecurity) {
          return 'Please accept Terms and Security Statement.';
        }
      }
    }

    if (role === 'professional') {
      if (step === 0) {
        if (!method) return 'Choose email or Google to continue.';
        if (method === 'email') {
          if (!professionalForm.email || !professionalForm.password || !professionalForm.confirmPassword) {
            return 'Email and password fields are required.';
          }
          if (professionalForm.password !== professionalForm.confirmPassword) {
            return 'Passwords do not match.';
          }
        }
      }
      if (step === 1) {
        if (!professionalForm.professionType || !professionalForm.businessName || !professionalForm.fullName) {
          return 'Profession type, business name, and full name are required.';
        }
      }
      if (step === 2) {
        if (!professionalForm.phone) return 'Phone is required for professionals.';
        if (
          (professionalForm.preferredContactMethod === 'WHATSAPP' ||
            professionalForm.preferredContactMethod === 'SMS') &&
          !professionalForm.phone
        ) {
          return 'Phone is required when WhatsApp or SMS is selected.';
        }
      }
      if (step === 3) {
        if (!professionalForm.nickname) return 'Nickname is required.';
        if (method === 'email' && !professionalForm.password) {
          return 'Password is required when using email sign-up.';
        }
      }
      if (step === 4) {
        if (!professionalForm.agreeToTerms || !professionalForm.agreeToSecurity) {
          return 'Please accept Terms and Security Statement.';
        }
      }
    }

    return null;
  };

  const submitClient = async () => {
    setLoading(true);
    setError(null);
    try {
      if (method === 'google') {
        if (!googleOnboardingToken) throw new Error('Google onboarding token is missing. Restart sign-in.');
        const response = await fetch(`${API_BASE_URL}/auth/oauth/google/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingToken: googleOnboardingToken,
            nickname: clientForm.nickname,
            firstName: clientForm.firstName,
            surname: clientForm.surname,
            mobile: clientForm.mobile || undefined,
            preferredLanguage: clientForm.preferredLanguage,
            preferredContactMethod: clientForm.preferredContactMethod,
            allowPartnerOffers: clientForm.allowPartnerOffers,
            allowPlatformUpdates: clientForm.allowPlatformUpdates,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Google onboarding failed.');
        saveClientSession(data);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: clientForm.nickname,
          firstName: clientForm.firstName,
          surname: clientForm.surname,
          email: clientForm.email,
          mobile: clientForm.mobile || undefined,
          preferredContactMethod: clientForm.preferredContactMethod,
          preferredLanguage: clientForm.preferredLanguage,
          allowPartnerOffers: clientForm.allowPartnerOffers,
          allowPlatformUpdates: clientForm.allowPlatformUpdates,
          requireOtpVerification: true,
          password: clientForm.password,
          role: 'client',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed.');
      if (data.otpRequired) {
        setPendingOtp({ email: clientForm.email, role: 'client', password: clientForm.password });
        return;
      }
      saveClientSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitProfessional = async () => {
    setLoading(true);
    setError(null);
    try {
      if (method === 'google') {
        if (!googleOnboardingToken) throw new Error('Google onboarding token is missing. Restart sign-in.');
        const response = await fetch(`${API_BASE_URL}/professional/auth/oauth/google/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingToken: googleOnboardingToken,
            professionType: professionalForm.professionType,
            fullName: professionalForm.fullName,
            businessName: professionalForm.businessName,
            phone: professionalForm.phone,
            nickname: professionalForm.nickname,
            preferredContactMethod: professionalForm.preferredContactMethod,
            preferredLanguage: professionalForm.preferredLanguage,
            allowPartnerOffers: professionalForm.allowPartnerOffers,
            allowPlatformUpdates: professionalForm.allowPlatformUpdates,
            emergencyCalloutAvailable: professionalForm.emergencyCalloutAvailable,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Google onboarding failed.');
        saveProfessionalSession(data);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/professional/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: professionalForm.email,
          password: professionalForm.password,
          phone: professionalForm.phone,
          professionType: professionalForm.professionType,
          fullName: professionalForm.fullName,
          businessName: professionalForm.businessName,
          nickname: professionalForm.nickname,
          preferredContactMethod: professionalForm.preferredContactMethod,
          preferredLanguage: professionalForm.preferredLanguage,
          allowPartnerOffers: professionalForm.allowPartnerOffers,
          allowPlatformUpdates: professionalForm.allowPlatformUpdates,
          requireOtpVerification: true,
          emergencyCalloutAvailable: professionalForm.emergencyCalloutAvailable,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed.');
      if (data.otpRequired) {
        setPendingOtp({
          email: professionalForm.email,
          role: 'professional',
          password: professionalForm.password,
        });
        return;
      }
      saveProfessionalSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    if (!role) return;
    const isLast = step >= stepsByRole[role].length - 1;
    if (isLast) {
      if (role === 'client') await submitClient();
      if (role === 'professional') await submitProfessional();
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step === 0) {
      setRole(null);
      setMethod(null);
      setGoogleOnboardingToken(null);
      setGoogleButtonRendered(false);
      return;
    }
    setStep((prev) => Math.max(0, prev - 1));
  };

  const handleVerifyOtp = async () => {
    if (!pendingOtp || !otpCode) {
      setError('Enter the verification code first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const endpoint =
        pendingOtp.role === 'client'
          ? `${API_BASE_URL}/auth/verify-registration-otp`
          : `${API_BASE_URL}/professional/auth/verify-registration-otp`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingOtp.email, code: otpCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Verification failed.');

      if (pendingOtp.role === 'client') {
        if (!pendingOtp.password) throw new Error('Missing password for login.');
        await clientLogin(pendingOtp.email, pendingOtp.password);
        router.push('/projects');
      } else {
        if (!pendingOtp.password) throw new Error('Missing password for login.');
        await professionalLogin(pendingOtp.email, pendingOtp.password);
        router.push('/professional-projects');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingOtp) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        pendingOtp.role === 'client'
          ? `${API_BASE_URL}/auth/resend-registration-otp`
          : `${API_BASE_URL}/professional/auth/resend-registration-otp`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingOtp.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to resend code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const clientPwStrength = passwordStrength(clientForm.password);
  const professionalPwStrength = passwordStrength(professionalForm.password);

  const pageTitle = useMemo(() => {
    if (!role) return "Let's get you in.";
    if (role === 'client') {
      const titles = ['How do you want in?', 'Tell us about you.', 'Almost done!'];
      return titles[step] ?? 'Almost done!';
    }
    const titles = ['How do you want in?', 'Your business.', 'Stay reachable.', 'Your account.', 'Last step.'];
    return titles[step] ?? 'Last step.';
  }, [role, step]);

  const checkIcon = <span className="text-amber-400">✓</span>;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d1a24] text-slate-100">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setGoogleScriptReady(true);
          setTimeout(renderGoogleButton, 50);
        }}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-[-120px] h-[360px] w-[360px] rounded-full bg-red-500/15 blur-3xl" />
        <div className="absolute right-[-90px] top-[180px] h-[340px] w-[340px] rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/3 h-[380px] w-[380px] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.05),transparent_40%),linear-gradient(130deg,rgba(13,12,10,0.95),rgba(20,18,16,0.92))]" />
        {dots.map((dot) => (
          <span
            key={dot.id}
            className="absolute h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
            style={{ left: dot.left, top: dot.top, animationDelay: dot.delay }}
          />
        ))}
      </div>

      <section className="relative flex min-h-screen w-full items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl">

          {!pendingOtp && (
            <div className="rounded-3xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3 px-6 pt-6">
                <Link href="/">
                  <Image src="/assets/mimo.webp" alt="Mimo" width={36} height={36} className="rounded-lg" />
                </Link>
              </div>
              <div className="px-6 pb-2 pt-3">
                <h1 className="text-2xl font-black text-white">{pageTitle}</h1>
                <p className="mt-1 text-sm text-slate-400">&nbsp;</p>
              </div>
              <div className="px-5 pb-6 sm:px-8">
              {!role && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">Choose your path</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      onClick={() => handleChooseRole('client')}
                      className="group rounded-2xl border border-red-400/40 bg-gradient-to-br from-red-500/20 to-red-600/20 p-5 text-left transition hover:-translate-y-1 hover:border-red-300"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-red-200">Client</p>
                      <p className="mt-2 text-xl font-extrabold text-white">Plan and control your renovation</p>
                      <p className="mt-2 text-sm text-slate-100">Compare quotes, track progress, and use escrow-backed payments.</p>
                    </button>
                    <button
                      onClick={() => handleChooseRole('professional')}
                      className="group rounded-2xl border border-blue-400/40 bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-5 text-left transition hover:-translate-y-1 hover:border-blue-300"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Professional</p>
                      <p className="mt-2 text-xl font-extrabold text-white">Win premium renovation projects</p>
                      <p className="mt-2 text-sm text-slate-100">Showcase your trade, manage milestones, and reduce admin overhead.</p>
                    </button>
                  </div>
                </div>
              )}

              {role && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-300">
                      <span>{stepsByRole[role][step]}</span>
                      <span>
                        Step {step + 1} / {totalSteps}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-gradient-to-r from-red-400 to-orange-400 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="flex gap-2">
                      {stepsByRole[role].map((name, idx) => (
                        <div
                          key={name}
                          className={`h-2 flex-1 rounded-full transition ${idx <= step ? 'bg-orange-400' : 'bg-white/20'}`}
                        />
                      ))}
                    </div>
                  </div>

                  {roleChosenMoment && (
                    <div className="animate-pulse rounded-xl border border-green-400/50 bg-green-500/15 px-4 py-3 text-sm font-semibold text-green-100">
                      Great choice. Let us get this set up.
                    </div>
                  )}

                  <div className="min-h-[280px] rounded-2xl border border-white/15 bg-black/10 p-4 transition-all duration-300 sm:p-6">
                    {role === 'client' && step === 0 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sign in method</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('google');
                              setError(null);
                              setTimeout(renderGoogleButton, 40);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left transition ${method === 'google' ? 'border-red-400 bg-red-500/20' : 'border-white/20 hover:bg-white/10'}`}
                          >
                            <p className="font-semibold">Continue with Google</p>
                            <p className="text-xs text-slate-200">Faster setup, verified email</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('email');
                              setGoogleOnboardingToken(null);
                              setError(null);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left transition ${method === 'email' ? 'border-red-400 bg-red-500/20' : 'border-white/20 hover:bg-white/10'}`}
                          >
                            <p className="font-semibold">Continue with Email</p>
                            <p className="text-xs text-slate-200">Classic signup with OTP verification</p>
                          </button>
                        </div>
                        {method === 'google' && (
                          <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                            <div ref={googleContainerRef} className="flex justify-center" />
                            {googleScriptReady && !googleButtonRendered && (
                              <p className="mt-2 text-center text-xs text-slate-300">Loading Google button...</p>
                            )}
                          </div>
                        )}
                        {method === 'email' && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm">
                              <span>Email</span>
                              <input
                                type="email"
                                value={clientForm.email}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
                                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                              />
                            </label>
                            <div className="space-y-1 text-sm">
                              <span>Password strength {clientPwStrength >= 3 ? checkIcon : null}</span>
                              <input
                                type="password"
                                value={clientForm.password}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, password: e.target.value }))}
                                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                              />
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/20">
                                <div
                                  className="h-full rounded bg-gradient-to-r from-red-400 via-orange-400 to-amber-400 transition-all"
                                  style={{ width: `${Math.min((clientPwStrength / 5) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                            <label className="space-y-1 text-sm sm:col-span-2">
                              <span>Confirm password {clientForm.confirmPassword && clientForm.confirmPassword === clientForm.password ? checkIcon : null}</span>
                              <input
                                type="password"
                                value={clientForm.confirmPassword}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {role === 'client' && step === 1 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">About you</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-sm">
                            <span>First name {clientForm.firstName ? checkIcon : null}</span>
                            <input
                              type="text"
                              value={clientForm.firstName}
                              onChange={(e) => setClientForm((prev) => ({ ...prev, firstName: e.target.value }))}
                              className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span>Surname {clientForm.surname ? checkIcon : null}</span>
                            <input
                              type="text"
                              value={clientForm.surname}
                              onChange={(e) => setClientForm((prev) => ({ ...prev, surname: e.target.value }))}
                              className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                            />
                          </label>
                          <label className="space-y-1 text-sm sm:col-span-2">
                            <span>Preferred language</span>
                            <select
                              value={clientForm.preferredLanguage}
                              onChange={(e) => setClientForm((prev) => ({ ...prev, preferredLanguage: e.target.value }))}
                              className="w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white outline-none focus:border-orange-400"
                            >
                              <option value="en">English</option>
                              <option value="zh-HK">Chinese (Hong Kong)</option>
                            </select>
                          </label>
                          <label className="space-y-1 text-sm sm:col-span-2">
                            <span>Preferred contact</span>
                            <select
                              value={clientForm.preferredContactMethod}
                              onChange={(e) =>
                                setClientForm((prev) => ({
                                  ...prev,
                                  preferredContactMethod: e.target.value as 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT',
                                }))
                              }
                              className="w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white outline-none focus:border-orange-400"
                            >
                              <option value="EMAIL">Email</option>
                              <option value="WHATSAPP">WhatsApp</option>
                              <option value="SMS">SMS</option>
                            </select>
                          </label>
                          <label className="space-y-1 text-sm sm:col-span-2">
                            <span>Mobile (optional unless WhatsApp/SMS)</span>
                            <input
                              type="tel"
                              value={clientForm.mobile}
                              onChange={(e) => setClientForm((prev) => ({ ...prev, mobile: e.target.value }))}
                              className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {role === 'client' && step === 2 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Nickname and preferences</p>
                        <label className="space-y-1 text-sm">
                          <span>Nickname {clientForm.nickname ? checkIcon : null}</span>
                          <input
                            type="text"
                            value={clientForm.nickname}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, nickname: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={clientForm.allowPartnerOffers}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, allowPartnerOffers: e.target.checked }))}
                          />
                          Receive partner offers
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={clientForm.allowPlatformUpdates}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, allowPlatformUpdates: e.target.checked }))}
                          />
                          Receive platform updates
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={clientForm.agreeToTerms}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, agreeToTerms: e.target.checked }))}
                          />
                          I agree to the Terms and Conditions
                          <button type="button" onClick={() => setShowTermsModal(true)} className="text-orange-300 underline">
                            Read
                          </button>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={clientForm.agreeToSecurity}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, agreeToSecurity: e.target.checked }))}
                          />
                          I agree to the Security Statement
                          <button type="button" onClick={() => setShowSecurityModal(true)} className="text-orange-300 underline">
                            Read
                          </button>
                        </label>
                      </div>
                    )}

                    {role === 'professional' && step === 0 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sign in method</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('google');
                              setError(null);
                              setTimeout(renderGoogleButton, 40);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left transition ${method === 'google' ? 'border-blue-400 bg-blue-500/20' : 'border-white/20 hover:bg-white/10'}`}
                          >
                            <p className="font-semibold">Continue with Google</p>
                            <p className="text-xs text-slate-200">Faster account verification</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('email');
                              setGoogleOnboardingToken(null);
                              setError(null);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left transition ${method === 'email' ? 'border-blue-400 bg-blue-500/20' : 'border-white/20 hover:bg-white/10'}`}
                          >
                            <p className="font-semibold">Continue with Email</p>
                            <p className="text-xs text-slate-200">Create password and verify by OTP</p>
                          </button>
                        </div>

                        {method === 'google' && (
                          <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                            <div ref={googleContainerRef} className="flex justify-center" />
                            {googleScriptReady && !googleButtonRendered && (
                              <p className="mt-2 text-center text-xs text-slate-300">Loading Google button...</p>
                            )}
                          </div>
                        )}

                        {method === 'email' && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm sm:col-span-2">
                              <span>Email</span>
                              <input
                                type="email"
                                value={professionalForm.email}
                                onChange={(e) => setProfessionalForm((prev) => ({ ...prev, email: e.target.value }))}
                                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                              />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span>Password strength {professionalPwStrength >= 3 ? checkIcon : null}</span>
                              <input
                                type="password"
                                value={professionalForm.password}
                                onChange={(e) => setProfessionalForm((prev) => ({ ...prev, password: e.target.value }))}
                                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                              />
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/20">
                                <div
                                  className="h-full rounded bg-gradient-to-r from-blue-400 via-cyan-400 to-green-400 transition-all"
                                  style={{ width: `${Math.min((professionalPwStrength / 5) * 100, 100)}%` }}
                                />
                              </div>
                            </label>
                            <label className="space-y-1 text-sm">
                              <span>Confirm password {professionalForm.confirmPassword && professionalForm.confirmPassword === professionalForm.password ? checkIcon : null}</span>
                              <input
                                type="password"
                                value={professionalForm.confirmPassword}
                                onChange={(e) => setProfessionalForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {role === 'professional' && step === 1 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Your business</p>
                        <label className="space-y-1 text-sm">
                          <span>Profession type {professionalForm.professionType ? checkIcon : null}</span>
                          <select
                            value={professionalForm.professionType}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, professionType: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-200"
                          >
                            <option value="company">Company</option>
                            <option value="contractor">Contractor</option>
                            <option value="reseller">Reseller</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span>Business name {professionalForm.businessName ? checkIcon : null}</span>
                          <input
                            type="text"
                            value={professionalForm.businessName}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, businessName: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span>Full name {professionalForm.fullName ? checkIcon : null}</span>
                          <input
                            type="text"
                            value={professionalForm.fullName}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, fullName: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                          />
                        </label>
                      </div>
                    )}

                    {role === 'professional' && step === 2 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contact and availability</p>
                        <label className="space-y-1 text-sm">
                          <span>Phone {professionalForm.phone ? checkIcon : null}</span>
                          <input
                            type="tel"
                            value={professionalForm.phone}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, phone: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span>Preferred contact</span>
                          <select
                            value={professionalForm.preferredContactMethod}
                            onChange={(e) =>
                              setProfessionalForm((prev) => ({
                                ...prev,
                                preferredContactMethod: e.target.value as 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT',
                              }))
                            }
                            className="w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-200"
                          >
                            <option value="EMAIL">Email</option>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="SMS">SMS</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={professionalForm.emergencyCalloutAvailable}
                            onChange={(e) =>
                              setProfessionalForm((prev) => ({
                                ...prev,
                                emergencyCalloutAvailable: e.target.checked,
                              }))
                            }
                          />
                          Available for emergency callouts
                        </label>
                      </div>
                    )}

                    {role === 'professional' && step === 3 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Your account</p>
                        <label className="space-y-1 text-sm">
                          <span>Nickname {professionalForm.nickname ? checkIcon : null}</span>
                          <input
                            type="text"
                            value={professionalForm.nickname}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, nickname: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-200"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span>Preferred language</span>
                          <select
                            value={professionalForm.preferredLanguage}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, preferredLanguage: e.target.value }))}
                            className="w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-200"
                          >
                            <option value="en">English</option>
                            <option value="zh-HK">Chinese (Hong Kong)</option>
                          </select>
                        </label>
                        {method === 'google' && (
                          <p className="rounded-lg border border-green-400/30 bg-green-500/10 px-3 py-2 text-sm text-green-100">
                            Google account selected. Password setup can be done later if needed.
                          </p>
                        )}
                      </div>
                    )}

                    {role === 'professional' && step === 4 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Terms and verification</p>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={professionalForm.allowPartnerOffers}
                            onChange={(e) =>
                              setProfessionalForm((prev) => ({ ...prev, allowPartnerOffers: e.target.checked }))
                            }
                          />
                          Receive partner offers
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={professionalForm.allowPlatformUpdates}
                            onChange={(e) =>
                              setProfessionalForm((prev) => ({ ...prev, allowPlatformUpdates: e.target.checked }))
                            }
                          />
                          Receive platform updates
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={professionalForm.agreeToTerms}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, agreeToTerms: e.target.checked }))}
                          />
                          I agree to the Terms and Conditions
                          <button type="button" onClick={() => setShowTermsModal(true)} className="text-orange-300 underline">
                            Read
                          </button>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={professionalForm.agreeToSecurity}
                            onChange={(e) =>
                              setProfessionalForm((prev) => ({ ...prev, agreeToSecurity: e.target.checked }))
                            }
                          />
                          I agree to the Security Statement
                          <button type="button" onClick={() => setShowSecurityModal(true)} className="text-orange-300 underline">
                            Read
                          </button>
                        </label>
                        {method === 'email' && (
                          <p className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
                            Email sign-up will send OTP verification before activating your account.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-xl border border-rose-300/60 bg-rose-500/20 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      {step === 0 ? 'Change path' : 'Back'}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleNext}
                      className="rounded-xl bg-gradient-to-r from-red-500 via-orange-400 to-amber-400 px-5 py-2 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60"
                    >
                      {loading
                        ? 'Please wait...'
                        : step >= totalSteps - 1
                        ? 'Complete signup'
                        : 'Continue'}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}

          {pendingOtp && (
            <div className="rounded-3xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3 px-6 pt-6">
                <Link href="/">
                  <Image src="/assets/mimo.webp" alt="Mimo" width={36} height={36} className="rounded-lg" />
                </Link>
              </div>
              <div className="px-6 pb-2 pt-3">
                <h1 className="text-2xl font-black text-white">Check your inbox.</h1>
                <p className="mt-1 text-sm text-slate-400">&nbsp;</p>
              </div>
              <div className="px-5 pb-6 sm:px-8">
              <p className="text-sm text-slate-300">Enter the OTP sent to {pendingOtp.email}.</p>
              <label className="mt-4 block space-y-1 text-sm">
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-orange-400"
                />
              </label>
              {error && (
                <div className="mt-3 rounded-xl border border-red-400/60 bg-red-500/20 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleVerifyOtp}
                  className="rounded-xl bg-gradient-to-r from-red-500 via-orange-400 to-amber-400 px-5 py-2 text-sm font-black text-white transition disabled:opacity-60"
                >
                  {loading ? 'Verifying...' : 'Verify and continue'}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleResendOtp}
                  className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Resend code
                </button>
              </div>
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-slate-200">
            Already have an account?{' '}
            <button onClick={openLoginModal} className="font-semibold text-orange-300 underline underline-offset-2">
              Sign in
            </button>
            <span className="mx-2">|</span>
            <Link href="/join" className="font-semibold text-orange-300 underline underline-offset-2">
              Classic join form
            </Link>
          </div>
        </div>
      </section>

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
    </main>
  );
}
