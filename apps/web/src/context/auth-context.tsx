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

interface User {
  id: string;
  nickname: string;
  email: string;
  firstName: string;
  surname: string;
  role: string;
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
    try {
      const token = localStorage.getItem('accessToken');
      const storedUserRaw = localStorage.getItem('user');
      const storedLocRaw = localStorage.getItem('userLocation');
      const persistedUser = storedUserRaw ? (JSON.parse(storedUserRaw) as User) : null;
      const persistedLocation = storedLocRaw
        ? (JSON.parse(storedLocRaw) as CanonicalLocation)
        : extractLocationFromUser(persistedUser);

      setAccessToken(token);
      setUser(persistedUser);
      setRole(persistedUser?.role ?? null);
      setUserLocationState(persistedLocation);
      setIsLoggedIn(Boolean(token && persistedUser));
    } catch (err) {
      console.warn('Failed to read persisted auth data:', err);
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
    const derivedLoc = extractLocationFromUser(result.user);
    if (derivedLoc.primary || derivedLoc.secondary || derivedLoc.tertiary) {
      persistLocation(derivedLoc);
    }
    setIsLoggedIn(true);

    return result;
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('userLocation');
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
        logout();
        return;
      }

      const result = await response.json();
      localStorage.setItem('accessToken', result.accessToken);
      setAccessToken(result.accessToken);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      logout();
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
