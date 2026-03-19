'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import type { CanonicalLocation } from '@/components/location-select';
import { API_BASE_URL } from '@/config/api';
import { clearAiClientState } from '@/lib/client-session';

interface User {
  id: string;
  nickname: string;
  email: string;
  firstName: string;
  surname: string;
  role: string;
  preferredLanguage?: string;
  locationPrimary?: string | null;
  locationSecondary?: string | null;
  locationTertiary?: string | null;
}

interface AuthContextType {
  isLoggedIn: boolean | undefined; // undefined = loading
  user: User | null;
  accessToken: string | null;
  role: string | null;
  userLocation: CanonicalLocation;
  setUserLocation: (loc: CanonicalLocation) => void;
  register: (data: {
    nickname: string;
    email: string;
    password: string;
    firstName: string;
    surname: string;
    chineseName?: string;
    mobile?: string;
    role?: string;
    preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    preferredLanguage?: string;
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    requireOtpVerification?: boolean;
  }) => Promise<
    | { success: boolean; accessToken: string; refreshToken: string; user: User }
    | {
        success: boolean;
        otpRequired: true;
        email: string;
        preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
      }
  >;
  login: (email: string, password: string) => Promise<{ success: boolean; accessToken: string; refreshToken: string; user: User }>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isAuthFailureStatus = (status: number) => status === 401 || status === 403;

  const extractLocationFromUser = (u: Partial<User> | null): CanonicalLocation => {
    if (!u) return {} as CanonicalLocation;
    const { locationPrimary, locationSecondary, locationTertiary } = u;
    if (locationPrimary || locationSecondary || locationTertiary) {
      return {
        primary: locationPrimary ?? undefined,
        secondary: locationSecondary ?? undefined,
        tertiary: locationTertiary ?? undefined,
      } as CanonicalLocation;
    }
    return {} as CanonicalLocation;
  };

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userLocation, setUserLocationState] = useState<CanonicalLocation>({} as CanonicalLocation);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoggedIn(false);
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const storedUserRaw = localStorage.getItem('user');
      const storedLocRaw = localStorage.getItem('userLocation');
      const restoredUser = storedUserRaw ? (JSON.parse(storedUserRaw) as User) : null;
      const restoredLocation = storedLocRaw
        ? (JSON.parse(storedLocRaw) as CanonicalLocation)
        : extractLocationFromUser(restoredUser);

      setAccessToken(token);
      setUser(restoredUser);
      setRole(restoredUser?.role ?? null);
      applyPreferredLocale(restoredUser?.preferredLanguage);
      setUserLocationState(restoredLocation);
      setIsLoggedIn(Boolean(token && restoredUser));
    } catch (err) {
      console.warn('Failed to restore auth data:', err);
      setAccessToken(null);
      setUser(null);
      setRole(null);
      setUserLocationState({} as CanonicalLocation);
      setIsLoggedIn(false);
    }
  }, []);

  const persistLocation = (loc: CanonicalLocation) => {
    setUserLocationState(loc);
    try {
      localStorage.setItem('userLocation', JSON.stringify(loc));
    } catch (err) {
      console.error('Failed to persist user location:', err);
    }
  };

  const normalizeLocale = (language?: string | null): 'en' | 'zh-HK' => {
    return language === 'zh-HK' ? 'zh-HK' : 'en';
  };

  const applyPreferredLocale = (language?: string | null) => {
    if (typeof document === 'undefined') return;
    const locale = normalizeLocale(language);
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
    document.documentElement.lang = locale;
  };

  const register = async (data: {
    nickname: string;
    email: string;
    password: string;
    firstName: string;
    surname: string;
    chineseName?: string;
    mobile?: string;
    role?: string;
    preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    preferredLanguage?: string;
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    requireOtpVerification?: boolean;
  }) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const result = await response.json();

    if (result?.otpRequired) {
      return result;
    }

    if (!result?.accessToken || !result?.refreshToken || !result?.user) {
      throw new Error('Registration response is missing authentication tokens');
    }

    // Save tokens and user to localStorage
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));

    setAccessToken(result.accessToken);
    setUser(result.user);
    setRole(result.user.role);
    applyPreferredLocale(result.user?.preferredLanguage);
    const derivedLoc = extractLocationFromUser(result.user);
    if (derivedLoc.primary || derivedLoc.secondary || derivedLoc.tertiary) {
      persistLocation(derivedLoc);
    }
    setIsLoggedIn(true);

    return result;
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const result = await response.json();

    console.log('[AuthContext.login] Login successful:', {
      user: result.user,
      hasAccessToken: !!result.accessToken,
    });

    // Save tokens and user to localStorage
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));

    setAccessToken(result.accessToken);
    setUser(result.user);
    setRole(result.user.role);
    applyPreferredLocale(result.user?.preferredLanguage);
    const derivedLoc = extractLocationFromUser(result.user);
    if (derivedLoc.primary || derivedLoc.secondary || derivedLoc.tertiary) {
      persistLocation(derivedLoc);
    }
    setIsLoggedIn(true);

    return result;
  };

  const logout = () => {
    // Clear all auth tokens (client and professional) to ensure clean slate
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('userLocation');
    localStorage.removeItem('professionalAccessToken');
    localStorage.removeItem('professionalRefreshToken');
    localStorage.removeItem('professional');
    clearAiClientState();
    setAccessToken(null);
    setUser(null);
    setRole(null);
    setUserLocationState({} as CanonicalLocation);
    setIsLoggedIn(false);
  };

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      logout();
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        if (isAuthFailureStatus(response.status)) {
          logout();
          return;
        }
        console.warn('Skipping forced logout on transient refresh failure:', response.status);
        return;
      }

      const result = await response.json();
      localStorage.setItem('accessToken', result.accessToken);
      setAccessToken(result.accessToken);
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        user,
        accessToken,
        role,
        userLocation,
        setUserLocation: persistLocation,
        register,
        login,
        logout,
        refreshToken: refreshAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
