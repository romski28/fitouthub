'use client';

import React, {
  createContext,
  useContext,
  useState,
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
  }) => Promise<{ success: boolean; accessToken: string; refreshToken: string; user: User }>;
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

  const initialPersisted = (() => {
    if (typeof window === 'undefined') {
      return { token: null, user: null, location: {} as CanonicalLocation };
    }

    try {
      const token = localStorage.getItem('accessToken');
      const storedUserRaw = localStorage.getItem('user');
      const storedLocRaw = localStorage.getItem('userLocation');
      const user = storedUserRaw ? (JSON.parse(storedUserRaw) as User) : null;
      const location = storedLocRaw ? (JSON.parse(storedLocRaw) as CanonicalLocation) : extractLocationFromUser(user);
      return { token, user, location };
    } catch (err) {
      console.warn('Failed to read persisted auth data:', err);
      return { token: null, user: null, location: {} as CanonicalLocation };
    }
  })();

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(
    initialPersisted.token && initialPersisted.user ? true : false
  );
  const [user, setUser] = useState<User | null>(initialPersisted.user);
  const [accessToken, setAccessToken] = useState<string | null>(initialPersisted.token);
  const [role, setRole] = useState<string | null>(initialPersisted.user?.role ?? null);
  const [userLocation, setUserLocationState] = useState<CanonicalLocation>(initialPersisted.location);

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
