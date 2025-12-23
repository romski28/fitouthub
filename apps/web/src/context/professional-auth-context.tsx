'use client';

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import { API_BASE_URL } from '@/config/api';

export interface Professional {
  id: string;
  email: string;
  fullName?: string;
  businessName?: string;
  professionType?: string;
  status?: string;
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
  }) => Promise<{ success: boolean; accessToken: string; refreshToken: string }>;
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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(undefined);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Store tokens and professional data
      localStorage.setItem('professionalAccessToken', result.accessToken);
      localStorage.setItem(
        'professionalRefreshToken',
        result.refreshToken || '',
      );
      localStorage.setItem('professional', JSON.stringify(result.professional));

      setAccessToken(result.accessToken);
      setProfessional(result.professional);
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
    localStorage.removeItem('professionalAccessToken');
    localStorage.removeItem('professionalRefreshToken');
    localStorage.removeItem('professional');
    setAccessToken(null);
    setProfessional(null);
    setIsLoggedIn(false);
    setError(null);
  };

  const refreshToken = async () => {
    const storedRefreshToken = localStorage.getItem('professionalRefreshToken');

    if (!storedRefreshToken) {
      logout();
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/professional/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!response.ok) {
        logout();
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
      logout();
    }
  };

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
