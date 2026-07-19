'use client';

import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { PolicyDocumentModal } from '@/components/policy-document-modal';
import PhoneInput from '@/components/phone-input';

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
  client: ['Sign in method', 'About you'],
  professional: ['Sign in method', 'Your business', 'Contact and availability', 'Your account', 'Terms and verification'],
};

export default function GetStartedPage() {
  const router = useRouter();
  const { openLoginModal } = useAuthModalControl();
  const { login: clientLogin } = useAuth();
  const { login: professionalLogin } = useProfessionalAuth();
  const locale = useLocale();
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<SignInMethod>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [pendingOtp, setPendingOtp] = useState<null | { email: string; role: Role; password?: string }> (null);
  const [otpCode, setOtpCode] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [googleOnboardingToken, setGoogleOnboardingToken] = useState<string | null>(null);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);
  const googleContainerRef = useRef<HTMLDivElement | null>(null);
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);

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

  // Pre-set role and step from URL params (e.g. ?role=client&step=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    const stepParam = params.get('step');
    if (roleParam === 'client' || roleParam === 'professional') {
      setRole(roleParam);
    }
    if (stepParam) {
      const parsed = parseInt(stepParam, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        setStep(parsed);
      }
    }
  }, []);

  const consumePostLoginRedirect = () => {
    if (typeof window === 'undefined') return null;
    try {
      const redirect = sessionStorage.getItem('postLoginRedirect');
      if (redirect) {
        sessionStorage.removeItem('postLoginRedirect');
        return redirect;
      }
    } catch {
      // Ignore storage failures
    }
    return null;
  };

  const totalSteps = role ? stepsByRole[role].length : 0;
  const progressPercent = role ? ((step + 1) / totalSteps) * 100 : 0;
  const canRenderGoogle = role && step === 0;
  const lockViewportHeight = !pendingOtp && (!role || step === 0);

  const saveClientSession = (result: ClientSessionResult) => {
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    window.location.href = consumePostLoginRedirect() || '/projects';
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
    setStep(0);
    setMethod(null);
    setGoogleOnboardingToken(null);
    setError(null);
    setGoogleButtonRendered(false);
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
            nickname: clientForm.firstName || 'User',
            firstName: clientForm.firstName,
            surname: clientForm.surname,
            mobile: clientForm.mobile || undefined,
            preferredLanguage: locale,
            preferredContactMethod: 'APP_NOTIFICATIONS',
            allowPartnerOffers: false,
            allowPlatformUpdates: true,
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
          nickname: clientForm.firstName || 'User',
          firstName: clientForm.firstName,
          surname: clientForm.surname,
          email: clientForm.email,
          mobile: clientForm.mobile || undefined,
          preferredContactMethod: 'APP_NOTIFICATIONS',
          preferredLanguage: locale,
          allowPartnerOffers: false,
          allowPlatformUpdates: true,
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

    // Check duplicate email before advancing from step 0
    if (step === 0 && method === 'email') {
      const email = role === 'client' ? clientForm.email : professionalForm.email;
      if (email) {
        setLoading(true);
        try {
          const res = await fetch(`${API_BASE_URL}/auth/check-email?email=${encodeURIComponent(email)}`);
          const data = await res.json();
          if (data.exists) {
            setError('An account with this email already exists. Please log in instead.');
            setLoading(false);
            return;
          }
        } catch {
          // If check fails, allow to proceed — backend will catch duplicates
        } finally {
          setLoading(false);
        }
      }
    }

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
    setStep((prev) => Math.max(0, prev - 1));
  };

  const checkMobileDuplicate = async (mobile: string) => {
    // Only check when it looks like a valid HK number (8+ digits after stripping)
    const digits = mobile.replace(/\D/g, '');
    if (digits.length < 8) {
      setMobileWarning(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/check-mobile?mobile=${encodeURIComponent(mobile)}`);
      const data = await res.json();
      if (data.exists) {
        setMobileWarning('This mobile number is already registered to another account.');
      } else {
        setMobileWarning(null);
      }
    } catch {
      setMobileWarning(null);
    }
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
        setVerificationSuccess(true);
        setTimeout(() => {
          router.push(consumePostLoginRedirect() || '/projects');
        }, 2000);
      } else {
        if (!pendingOtp.password) throw new Error('Missing password for login.');
        await professionalLogin(pendingOtp.email, pendingOtp.password);
        setVerificationSuccess(true);
        setTimeout(() => {
          router.push('/professional-projects');
        }, 2000);
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
      const titles = ['How do you want in?', 'Tell us about you.'];
      return titles[step] ?? 'Almost done!';
    }
    const titles = ['How do you want in?', 'Your business.', 'Stay reachable.', 'Your account.', 'Last step.'];
    return titles[step] ?? 'Last step.';
  }, [role, step]);

  const checkIcon = <span className="text-amber-400">✓</span>;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1A1A1A] text-slate-100">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setGoogleScriptReady(true);
          setTimeout(renderGoogleButton, 50);
        }}
      />

      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/assets/images/hero-homepage-empty.webp"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#1A1A1A]/58" />
      </div>

      <section
        className={`relative flex w-full items-center justify-center px-4 ${
          lockViewportHeight ? 'h-[100dvh] overflow-hidden py-4 sm:py-5' : 'min-h-screen py-8'
        }`}
      >
        <div className="w-full max-w-2xl">

          {!pendingOtp && (
            <div className="rounded-3xl border border-[#EFE7CF]/70 bg-[#EFE7CF]/90 text-[#1A1A1A] shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-sm">
              <div className="flex items-center gap-3 px-6 pt-6">
                <Link href="/">
                  <Image src="/assets/lockup-horizontal-ink.webp" alt="Mimo" width={144} height={144} className="rounded-xl" />
                </Link>
              </div>
              <div className="px-6 pb-2 pt-3">
                <h1 className="text-2xl font-black text-[#1A1A1A]">{pageTitle}</h1>
                <p className="mt-1 text-sm text-[#FF6B5B]">&nbsp;</p>
              </div>
              <div className="px-5 pb-6 sm:px-8">
              {!role && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#FF6B5B]">Choose your path</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Client card — Sarah peeks in from the left */}
                    <button
                      onClick={() => handleChooseRole('client')}
                      className="group relative rounded-2xl border border-[#FF6B5B]/40 bg-gradient-to-br from-[#FF6B5B]/10 to-[#FF6B5B]/15 pb-5 pl-28 pr-5 pt-5 text-left transition hover:-translate-y-1 hover:border-[#FF6B5B]/50"
                    >
                      <div className="pointer-events-none absolute bottom-0 -left-6 w-28 select-none">
                        <Image src="/assets/images/sarah-character-pack/sarah-800.webp" alt="Sarah" width={112} height={160} className="object-contain" />
                      </div>
                      <p className="text-xs uppercase tracking-[0.2em] text-red-700">Client</p>
                      <p className="mt-2 text-xl font-extrabold text-[#1A1A1A]">Plan and control your renovation</p>
                      <p className="mt-2 text-sm text-[#4E4A42]">Compare quotes, track progress, and use escrow-backed payments.</p>
                    </button>
                    {/* Professional card — Ben peeks in from the right */}
                    <button
                      onClick={() => handleChooseRole('professional')}
                      className="group relative rounded-2xl border border-[#0E7C3A]/40 bg-gradient-to-br from-[#0E7C3A]/10 to-[#0E7C3A]/15 pb-5 pl-5 pr-28 pt-5 text-left transition hover:-translate-y-1 hover:border-[#0E7C3A]/50"
                    >
                      <div className="pointer-events-none absolute bottom-0 -right-6 w-28 select-none">
                        <Image src="/assets/images/tradesmen-character-pack/ben-800.webp" alt="Ben" width={112} height={160} className="object-contain" />
                      </div>
                      <p className="text-xs uppercase tracking-[0.2em] text-blue-700">Professional</p>
                      <p className="mt-2 text-xl font-extrabold text-[#1A1A1A]">Win premium renovation projects</p>
                      <p className="mt-2 text-sm text-[#4E4A42]">Showcase your trade, manage milestones, and reduce admin overhead.</p>
                    </button>
                  </div>
                </div>
              )}

              {role && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[#5B5851]">
                      <span>{stepsByRole[role][step]}</span>
                      <span>
                        Step {step + 1} / {totalSteps}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-[#0E7C3A] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>

                  <div className="min-h-[280px] rounded-2xl border border-[#E8DFD5] bg-[#EFE7CF]/78 p-4 transition-all duration-300 sm:p-6">
                    {role === 'client' && step === 0 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Sign in method</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('google');
                              setError(null);
                              setTimeout(renderGoogleButton, 40);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left text-[#1A1A1A] transition ${method === 'google' ? 'border-[#0E7C3A] bg-[#E8F5E9]' : 'border-[#E8DFD5] bg-[#EFE7CF] hover:bg-[#EEE5D4]'}`}
                          >
                            <p className="font-semibold">Continue with Google</p>
                            <p className="text-xs text-[#5B5851]">Faster setup, verified email</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('email');
                              setGoogleOnboardingToken(null);
                              setError(null);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left text-[#1A1A1A] transition ${method === 'email' ? 'border-[#D45F4F] bg-[#FFE1DA]' : 'border-[#E8DFD5] bg-[#EFE7CF] hover:bg-[#EEE5D4]'}`}
                          >
                            <p className="font-semibold">Continue with Email</p>
                            <p className="text-xs text-[#5B5851]">Classic signup with OTP verification</p>
                          </button>
                        </div>
                        {method === 'google' && (
                          <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                            <div ref={googleContainerRef} className="flex justify-center" />
                            {googleScriptReady && !googleButtonRendered && (
                              <p className="mt-2 text-center text-xs text-[#5B5851]">Loading Google button...</p>
                            )}
                          </div>
                        )}
                        {method === 'email' && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm sm:col-span-2">
                              <span>Email</span>
                              <input
                                type="email"
                                autoComplete="off"
                                value={clientForm.email}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
                                className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                              />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span>Password strength {clientPwStrength >= 3 ? checkIcon : null}</span>
                              <input
                                type="password"
                                autoComplete="new-password"
                                value={clientForm.password}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, password: e.target.value }))}
                                className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                              />
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/20">
                                <div
                                  className="h-full rounded bg-[#0E7C3A] transition-all"
                                  style={{ width: `${Math.min((clientPwStrength / 5) * 100, 100)}%` }}
                                />
                              </div>
                            </label>
                            <label className="space-y-1 text-sm">
                              <span>Confirm password {clientForm.confirmPassword && clientForm.confirmPassword === clientForm.password ? checkIcon : null}</span>
                              <input
                                type="password"
                                autoComplete="new-password"
                                value={clientForm.confirmPassword}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {role === 'client' && step === 1 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">About you</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-sm">
                            <span>First name {clientForm.firstName ? checkIcon : null}</span>
                            <input
                              type="text"
                              value={clientForm.firstName}
                              onChange={(e) => setClientForm((prev) => ({ ...prev, firstName: e.target.value }))}
                              className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span>Surname {clientForm.surname ? checkIcon : null}</span>
                            <input
                              type="text"
                              value={clientForm.surname}
                              onChange={(e) => setClientForm((prev) => ({ ...prev, surname: e.target.value }))}
                              className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                            />
                          </label>
                          <label className="space-y-1 text-sm sm:col-span-2">
                            <span>Mobile (optional)</span>
                            <PhoneInput
                              value={clientForm.mobile}
                              onChange={(val) => {
                                setClientForm((prev) => ({ ...prev, mobile: val }));
                                setMobileWarning(null);
                              }}
                              onBlur={() => checkMobileDuplicate(clientForm.mobile)}
                            />
                            {mobileWarning && (
                              <p className="mt-1 text-xs text-amber-600">{mobileWarning}</p>
                            )}
                          </label>
                        </div>
                        <div className="space-y-3 pt-2">
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
                      </div>
                    )}

                    {role === 'professional' && step === 0 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Sign in method</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('google');
                              setError(null);
                              setTimeout(renderGoogleButton, 40);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left text-[#1A1A1A] transition ${method === 'google' ? 'border-[#0E7C3A] bg-[#E8F5E9]' : 'border-[#E8DFD5] bg-[#EFE7CF] hover:bg-[#EEE5D4]'}`}
                          >
                            <p className="font-semibold">Continue with Google</p>
                            <p className="text-xs text-[#5B5851]">Faster account verification</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('email');
                              setGoogleOnboardingToken(null);
                              setError(null);
                            }}
                            className={`rounded-xl border px-4 py-3 text-left text-[#1A1A1A] transition ${method === 'email' ? 'border-[#D45F4F] bg-[#FFE1DA]' : 'border-[#E8DFD5] bg-[#EFE7CF] hover:bg-[#EEE5D4]'}`}
                          >
                            <p className="font-semibold">Continue with Email</p>
                            <p className="text-xs text-[#5B5851]">Create password and verify by OTP</p>
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
                                autoComplete="off"
                                value={professionalForm.email}
                                onChange={(e) => setProfessionalForm((prev) => ({ ...prev, email: e.target.value }))}
                                className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                              />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span>Password strength {professionalPwStrength >= 3 ? checkIcon : null}</span>
                              <input
                                type="password"
                                autoComplete="new-password"
                                value={professionalForm.password}
                                onChange={(e) => setProfessionalForm((prev) => ({ ...prev, password: e.target.value }))}
                                className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
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
                                autoComplete="new-password"
                                value={professionalForm.confirmPassword}
                                onChange={(e) => setProfessionalForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {role === 'professional' && step === 1 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Your business</p>
                        <label className="space-y-1 text-sm">
                          <span>Profession type {professionalForm.professionType ? checkIcon : null}</span>
                          <select
                            value={professionalForm.professionType}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, professionType: e.target.value }))}
                            className="w-full rounded-lg border border-[#E8DFD5] bg-white/90 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
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
                            className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span>Full name {professionalForm.fullName ? checkIcon : null}</span>
                          <input
                            type="text"
                            value={professionalForm.fullName}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, fullName: e.target.value }))}
                            className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                          />
                        </label>
                      </div>
                    )}

                    {role === 'professional' && step === 2 && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Contact and availability</p>
                        <label className="space-y-1 text-sm">
                          <span>Phone {professionalForm.phone ? checkIcon : null}</span>
                          <PhoneInput
                            value={professionalForm.phone}
                            onChange={(val) => setProfessionalForm((prev) => ({ ...prev, phone: val }))}
                            required
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
                            className="w-full rounded-lg border border-[#E8DFD5] bg-white/90 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
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
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Your account</p>
                        <label className="space-y-1 text-sm">
                          <span>Nickname {professionalForm.nickname ? checkIcon : null}</span>
                          <input
                            type="text"
                            value={professionalForm.nickname}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, nickname: e.target.value }))}
                            className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span>Preferred language</span>
                          <select
                            value={professionalForm.preferredLanguage}
                            onChange={(e) => setProfessionalForm((prev) => ({ ...prev, preferredLanguage: e.target.value }))}
                            className="w-full rounded-lg border border-[#E8DFD5] bg-white/90 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
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
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B5B]">Terms and verification</p>
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
                    {step === 0 ? (
                      <button
                        type="button"
                        onClick={() => router.push('/')}
                        className="rounded-xl bg-[#FF7F50] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#E06940]"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="rounded-xl border border-[#0E7C3A] bg-[#0E7C3A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0A5D2D]"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleNext}
                      className="rounded-xl border border-[#0E7C3A] bg-[#0E7C3A] px-5 py-2 text-sm font-black text-white transition hover:bg-[#0A5D2D] disabled:opacity-60"
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
            <div className="rounded-3xl border border-[#EFE7CF]/70 bg-[#EFE7CF]/90 text-[#1A1A1A] shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-sm">
              {verificationSuccess ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 space-y-4">
                  <div className="text-6xl animate-bounce">🎉</div>
                  <h2 className="text-2xl font-black text-[#1A1A1A]">You're all set!</h2>
                  <p className="text-sm text-[#5B5851]">Taking you to your dashboard…</p>
                  <div className="w-48 h-1.5 rounded-full overflow-hidden bg-white/20">
                    <div className="h-full rounded-full bg-[#0E7C3A] animate-pulse" style={{ width: '100%' }} />
                  </div>
                </div>
              ) : (
              <>
              <div className="flex items-center gap-3 px-6 pt-6">
                <Link href="/">
                  <Image src="/assets/lockup-horizontal-ink.webp" alt="Mimo" width={144} height={144} className="rounded-xl" />
                </Link>
              </div>
              <div className="px-6 pb-2 pt-3">
                <h1 className="text-2xl font-black text-[#1A1A1A]">Check your inbox.</h1>
                <p className="mt-1 text-sm text-[#FF6B5B]">&nbsp;</p>
              </div>
              <div className="px-5 pb-6 sm:px-8">
              <p className="text-sm text-[#5B5851]">Enter the OTP sent to {pendingOtp.email}.</p>
              <label className="mt-4 block space-y-1 text-sm">
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-[#E8DFD5] bg-white/80 px-3 py-2 text-[#1A1A1A] outline-none focus:border-[#0E7C3A]"
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
                  className="rounded-xl border border-[#0E7C3A] bg-[#0E7C3A] px-5 py-2 text-sm font-black text-white transition hover:bg-[#0A5D2D] disabled:opacity-60"
                >
                  {loading ? 'Verifying...' : 'Verify and continue'}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleResendOtp}
                  className="rounded-xl border border-[#E8DFD5] px-4 py-2 text-sm font-semibold text-[#1A1A1A] transition hover:bg-black/5"
                >
                  Resend code
                </button>
              </div>
              </div>
              </>
              )}
            </div>
          )}

          <div className={`text-center text-sm text-slate-200 ${lockViewportHeight ? 'mt-4' : 'mt-6'}`}>
            Already have an account?{' '}
            <button onClick={openLoginModal} className="font-semibold text-orange-300 underline underline-offset-2">
              Sign in
            </button>
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

