'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { DocumentModal } from '@/components/document-modal';
import { TERMS_AND_CONDITIONS } from '@/content/terms-and-conditions';
import { SECURITY_STATEMENT } from '@/content/security-statement';

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
  const { login, register } = useAuth();
  const { login: loginProfessional, register: registerProfessional } = useProfessionalAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'join'>(defaultTab);
  const [userType, setUserType] = useState<'client' | 'professional'>('client');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [clientAgreeToTerms, setClientAgreeToTerms] = useState(false);
  const [professionalAgreeToTerms, setProfessionalAgreeToTerms] = useState(false);

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
  }, [isOpen]);

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
      setError('You must agree to the Terms and Conditions to continue');
      return;
    }

    if (clientForm.password !== clientForm.confirmPassword) {
        setError(modalT('passwordMismatch'));
        return;
    }

    setLoading(true);
    try {
      await register({
        nickname: clientForm.nickname,
        email: clientForm.email,
        password: clientForm.password,
        firstName: clientForm.firstName,
        surname: clientForm.surname,
        mobile: clientForm.mobile || undefined,
        role: 'client',
      });
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
      setError('You must agree to the Terms and Conditions to continue');
      return;
    }

    if (professionalForm.password !== professionalForm.confirmPassword) {
        setError(modalT('passwordMismatch'));
        return;
    }

    setLoading(true);
    try {
      await registerProfessional({
        businessName: professionalForm.businessName,
        fullName: professionalForm.contactName,
        email: professionalForm.email,
        password: professionalForm.password,
        phone: professionalForm.phone,
      });
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
      setError(err instanceof Error ? err.message : 'Registration failed');
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
            aria-label="Close modal"
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
              {/* User Type Toggle */}
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

              {userType === 'client' ? (
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
                  <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="clientAgreeToTerms"
                        checked={clientAgreeToTerms}
                        onChange={(e) => setClientAgreeToTerms(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="clientAgreeToTerms" className="text-xs text-gray-700">
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
                        id="professionalAgreeToTerms"
                        checked={professionalAgreeToTerms}
                        onChange={(e) => setProfessionalAgreeToTerms(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="professionalAgreeToTerms" className="text-xs text-gray-700">
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
      </div>
    </div>
  );
};
