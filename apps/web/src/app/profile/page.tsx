'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useTranslations } from 'next-intl';
import LocationSelect, { type CanonicalLocation } from '@/components/location-select';
import { toast } from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';

export default function ProfilePage() {
  const { isLoggedIn, user, accessToken, logout, userLocation, setUserLocation } = useAuth();
  const router = useRouter();
  const t = useTranslations('profile.client');
  const commonT = useTranslations('common');
  const [locationDraft, setLocationDraft] = useState<CanonicalLocation>(userLocation || ({} as CanonicalLocation));
  const [locationSaved, setLocationSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [password, setPassword] = useState('');

  // Notification preferences
  const [allowPartnerOffers, setAllowPartnerOffers] = useState(false);
  const [allowPlatformUpdates, setAllowPlatformUpdates] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  // Load user data into form
  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setFirstName(user.firstName || '');
      setSurname(user.surname || '');
    }
  }, [user]);

  // Load notification preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user || !accessToken) return;
      try {
        const res = await fetch(`${API_BASE_URL}/users/${user.id}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        
        if (res.status === 404) {
          // User doesn't exist - likely stale session. Skip preferences load but don't logout yet
          console.warn('User profile not found in this environment');
          setPreferencesLoading(false);
          return;
        }
        
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const error = await res.json();
            throw new Error(error.message || 'Failed to load preferences');
          } else {
            throw new Error('Failed to load preferences');
          }
        }
        
        const data = await res.json();
        if (data.notificationPreference) {
          setAllowPartnerOffers(data.notificationPreference.allowPartnerOffers ?? false);
          setAllowPlatformUpdates(data.notificationPreference.allowPlatformUpdates ?? true);
        }
      } catch (err) {
        console.error('Error loading preferences:', err);
        // Silently fail - preferences are optional and may not load in all environments
      } finally {
        setPreferencesLoading(false);
      }
    };

    loadPreferences();
  }, [user, accessToken, logout]);

  // Redirect unauthenticated users
  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !user) return;

    setSaving(true);
    try {
      // Update profile
      const res = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email, firstName, surname }),
      });

      if (res.status === 404) {
        toast.error('Session expired. Please log in again.');
        logout();
        return;
      }

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        const errorText = contentType?.includes('application/json')
          ? (await res.json()).message
          : await res.text();
        throw new Error(errorText);
      }

      // Update password if provided
      if (password && password.length >= 6) {
        const pwRes = await fetch(`${API_BASE_URL}/users/${user.id}/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ password }),
        });

        if (!pwRes.ok) {
          const errorText = await pwRes.text();
          throw new Error(errorText);
        }
        setPassword('');
      }

      // Update notification preferences
      const prefRes = await fetch(`${API_BASE_URL}/users/${user.id}/notification-preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          allowPartnerOffers,
          allowPlatformUpdates,
        }),
      });

      if (!prefRes.ok) throw new Error(await prefRes.text());

      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Show loading state while auth is initializing
  if (isLoggedIn === undefined || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-600">{t('saving')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white rounded-lg border border-slate-200 p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-600 mt-1">{t('subtitle')}</p>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4 pt-6 border-t border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">{t('accountInfo')}</h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">{t('firstName')}</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">{t('surname')}</label>
              <input
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">{t('newPassword')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={t('passwordHint')}
            />
            <p className="mt-1 text-xs text-slate-500">{t('passwordNote')}</p>
          </div>

          {/* Notification Preferences */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
            
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowPartnerOffers"
                checked={allowPartnerOffers}
                onChange={(e) => setAllowPartnerOffers(e.target.checked)}
                disabled={preferencesLoading}
                className="rounded border-slate-300"
              />
              <label htmlFor="allowPartnerOffers" className="text-sm text-slate-700">
                Receive news and offers from our registered suppliers and partners
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowPlatformUpdates"
                checked={allowPlatformUpdates}
                onChange={(e) => setAllowPlatformUpdates(e.target.checked)}
                disabled={preferencesLoading}
                className="rounded border-slate-300"
              />
              <label htmlFor="allowPlatformUpdates" className="text-sm text-slate-700">
                Receive news and updates about the Fitout Hub platform and its associates
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? t('saving') : t('saveChanges')}
            </button>
          </div>
        </form>

        {/* Default location for browsing trades/professionals */}
        <div className="pt-6 border-t border-slate-200 space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">{t('defaultLocation')}</h2>
          <p className="text-sm text-slate-600">
            {t('defaultLocationHint')}
          </p>
          <LocationSelect value={locationDraft} onChange={setLocationDraft} enableSearch={true} />
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
            onClick={() => {
              setUserLocation(locationDraft);
              setLocationSaved(true);
              setTimeout(() => setLocationSaved(false), 1500);
            }}
          >
            {t('saveDefaultLocation')}
          </button>
          {locationSaved ? (
            <p className="text-sm text-green-700">{t('locationSaved')}</p>
          ) : null}
        </div>

        {/* Account Info */}
        <div className="pt-6 border-t border-slate-200 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">{t('accountDetails')}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-slate-600">{t('accountType')}</label>
              <span className="inline-block font-medium text-white bg-blue-600 px-3 py-1 rounded mt-1">
                {user.role === 'professional' ? 'Contractor' : user.role === 'reseller' ? 'Reseller' : 'Client'}
              </span>
            </div>
            <div>
              <label className="block text-slate-600">{t('userId')}</label>
              <p className="text-slate-900 font-mono mt-1">{user.id}</p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200">
          <button
            onClick={logout}
            className="rounded-md bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
