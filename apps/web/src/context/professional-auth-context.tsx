'use client';

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { API_BASE_URL } from '@/config/api';
import { clearAiClientState } from '@/lib/client-session';

export interface Professional {
  id: string;
  email: string;
  fullName?: string;
  businessName?: string;
  professionType?: string;
  status?: string;
  preferredLanguage?: string;
}

interface ProfessionalAuthContextType {
  isLoggedIn: boolean | undefined; // undefined = loading
  professional: Professional | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  register: (data: {
    email: string;
    password: string;
    phone?: string;
    professionType?: string;
    fullName?: string;
    businessName?: string;
    preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    preferredLanguage?: string;
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    requireOtpVerification?: boolean;
    emergencyCalloutAvailable?: boolean;
  }) => Promise<
    | { success: boolean; accessToken: string; refreshToken: string }
    | {
        success: boolean;
        otpRequired: true;
        email: string;
        preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
      }
  >;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; accessToken: string; refreshToken: string }>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

const ProfessionalAuthContext = createContext<
  ProfessionalAuthContextType | undefined
>(undefined);

export const ProfessionalAuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const isAuthFailureStatus = (status: number) => status === 401 || status === 403;

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(undefined);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  const normalizeLocale = (language?: string | null): 'en' | 'zh-HK' => {
    return language === 'zh-HK' ? 'zh-HK' : 'en';
  };

  const applyPreferredLocale = (language?: string | null) => {
    if (typeof document === 'undefined') return;
    const locale = normalizeLocale(language);
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
    document.documentElement.lang = locale;
  };

  // Initialize from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoggedIn(false);
      return;
    }

    try {
      const storedToken = localStorage.getItem('professionalAccessToken');
      const storedProfessional = localStorage.getItem('professional');

      if (storedToken && storedProfessional) {
        const prof = JSON.parse(storedProfessional) as Professional;
        setAccessToken(storedToken);
        setProfessional(prof);
        applyPreferredLocale(prof?.preferredLanguage);
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (err) {
      console.warn('Failed to restore professional auth:', err);
      setIsLoggedIn(false);
    }
  }, []);

  const register = async (data: {
    email: string;
    password: string;
    phone?: string;
    professionType?: string;
    fullName?: string;
    businessName?: string;
    preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    preferredLanguage?: string;
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    requireOtpVerification?: boolean;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/professional/auth/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || 'Registration failed. Please try again.',
        );
      }

      const result = await response.json();

      if (result?.otpRequired) {
        return result;
      }

      if (!result?.accessToken || !result?.refreshToken || !result?.professional) {
        throw new Error('Registration response is missing authentication tokens');
      }

      // Store tokens and professional data
      localStorage.setItem('professionalAccessToken', result.accessToken);
      localStorage.setItem(
        'professionalRefreshToken',
        result.refreshToken || '',
      );
      localStorage.setItem('professional', JSON.stringify(result.professional));

      setAccessToken(result.accessToken);
      setProfessional(result.professional);
      applyPreferredLocale(result.professional?.preferredLanguage);
      setIsLoggedIn(true);

      return {
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/professional/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || 'Login failed. Please check your credentials.',
        );
      }

      const result = await response.json();

      // Store tokens and professional data
      localStorage.setItem('professionalAccessToken', result.accessToken);
      localStorage.setItem(
        'professionalRefreshToken',
        result.refreshToken || '',
      );
      localStorage.setItem('professional', JSON.stringify(result.professional));

      setAccessToken(result.accessToken);
      setProfessional(result.professional);
      applyPreferredLocale(result.professional?.preferredLanguage);
      setIsLoggedIn(true);

      return {
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // Clear all auth tokens (client and professional) to ensure clean slate
    localStorage.removeItem('professionalAccessToken');
    localStorage.removeItem('professionalRefreshToken');
    localStorage.removeItem('professional');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('userLocation');
    clearAiClientState();
    setAccessToken(null);
    setProfessional(null);
    setIsLoggedIn(false);
    setError(null);
  };

  const refreshToken = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    const storedRefreshToken = localStorage.getItem('professionalRefreshToken');

    if (!storedRefreshToken) {
      logout();
      return;
    }

    try {
      refreshInFlightRef.current = true;

      const response = await fetch(`${API_BASE_URL}/professional/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!response.ok) {
        if (isAuthFailureStatus(response.status)) {
          logout();
          return;
        }
        console.warn('Skipping forced logout on transient professional refresh failure:', response.status);
        return;
      }

      const result = await response.json();
      localStorage.setItem('professionalAccessToken', result.accessToken);
      localStorage.setItem(
        'professionalRefreshToken',
        result.refreshToken || storedRefreshToken,
      );
      setAccessToken(result.accessToken);
    } catch (err) {
      console.error('Token refresh failed:', err);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isLoggedIn) return;

    const tryRefresh = () => {
      const storedRefreshToken = localStorage.getItem('professionalRefreshToken');
      if (!storedRefreshToken) return;
      void refreshToken();
    };

    tryRefresh();

    const intervalId = window.setInterval(tryRefresh, 5 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tryRefresh();
      }
    };

    const handleFocus = () => {
      tryRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isLoggedIn, refreshToken]);

  const clearError = () => setError(null);

  return (
    <ProfessionalAuthContext.Provider
      value={{
        isLoggedIn,
        professional,
        accessToken,
        loading,
        error,
        register,
        login,
        logout,
        refreshToken,
        clearError,
      }}
    >
      {children}
    </ProfessionalAuthContext.Provider>
  );
};

export const useProfessionalAuth = () => {
  const context = useContext(ProfessionalAuthContext);
  if (context === undefined) {
    throw new Error(
      'useProfessionalAuth must be used within ProfessionalAuthProvider',
    );
  }
  return context;
};
