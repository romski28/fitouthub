'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useTranslations } from 'next-intl';
import LocationSelect, { type CanonicalLocation } from '@/components/location-select';
import { HkDistrictMap } from '@/components/hk-district-map';
import { HkDistrictList } from '@/components/hk-district-list';
import { MapOrList } from '@/components/map-or-list';
import { areaCodeToCanonicalLocation, deriveProjectAreaCodeFromLocation } from '@/lib/hk-districts';
import { toast } from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';

export default function ProfilePage() {
  const { isLoggedIn, user, accessToken, logout, userLocation, setUserLocation } = useAuth();
  const router = useRouter();
  const t = useTranslations('profile.client');
  const [locationDraft, setLocationDraft] = useState<CanonicalLocation>(userLocation || ({} as CanonicalLocation));
  const [saving, setSaving] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [mobile, setMobile] = useState('');

  const selectedLocationAreaCode = useMemo(
    () => deriveProjectAreaCodeFromLocation(locationDraft),
    [locationDraft],
  );

  const profileCompletion = useMemo(() => {
    const checks = [
      email.trim().length > 0,
      firstName.trim().length > 0,
      surname.trim().length > 0,
      mobile.trim().length > 0,
      Boolean(locationDraft.primary || locationDraft.secondary || locationDraft.tertiary),
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [email, firstName, surname, mobile, locationDraft]);

  const locationSummary =
    locationDraft.tertiary || locationDraft.secondary || locationDraft.primary || 'Not set yet';

  const paperCardClassName =
    'rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] p-6 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm';
  const paperInputClassName =
    'mt-2 w-full rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[rgba(185,78,45,0.5)] focus:ring-2 focus:ring-[rgba(185,78,45,0.14)]';
  const sectionLabelClassName = 'text-sm font-semibold text-slate-800';

  const handleMapLocationSelect = (codes: string[]) => {
    const code = codes[0];
    const canonical = code ? areaCodeToCanonicalLocation(code) : {};
    setLocationDraft(canonical as CanonicalLocation);
  };

  // Notification preferences
  const [allowPartnerOffers, setAllowPartnerOffers] = useState(false);
  const [allowPlatformUpdates, setAllowPlatformUpdates] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT'>('WHATSAPP');
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  // Load user data into form
  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setFirstName(user.firstName || '');
      setSurname(user.surname || '');
    }
  }, [user]);

  // Keep draft location in sync once auth/localStorage hydration completes
  useEffect(() => {
    setLocationDraft(userLocation || ({} as CanonicalLocation));
  }, [userLocation]);

  const fetchUser = async (path = '', init?: RequestInit) => {
    if (!accessToken || !user) {
      throw new Error('Missing authentication');
    }

    const headers = {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    };

    // Prefer token-bound endpoints; fallback for environments where /me routes are not yet deployed
    let res = await fetchWithRetry(`${API_BASE_URL}/users/me${path}`, {
      ...init,
      headers,
    });

    if (res.status === 404) {
      res = await fetchWithRetry(`${API_BASE_URL}/users/${user.id}${path}`, {
        ...init,
        headers,
      });
    }

    return res;
  };

  // Load notification preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user || !accessToken) return;
      try {
        const res = await fetchUser();
        
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
        setMobile(data.mobile || '');
        const nextLocation: CanonicalLocation = {
          primary: data.locationPrimary || undefined,
          secondary: data.locationSecondary || undefined,
          tertiary: data.locationTertiary || undefined,
        };
        if (nextLocation.primary || nextLocation.secondary || nextLocation.tertiary) {
          setUserLocation(nextLocation);
        }
        if (data.notificationPreference) {
          setAllowPartnerOffers(data.notificationPreference.allowPartnerOffers ?? false);
          setAllowPlatformUpdates(data.notificationPreference.allowPlatformUpdates ?? true);
          setPreferredLanguage(data.notificationPreference.preferredLanguage ?? 'en');
          setPreferredContactMethod(data.notificationPreference.primaryChannel ?? 'WHATSAPP');
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
      const res = await fetchUser('', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          firstName,
          surname,
          mobile: mobile || undefined,
          locationPrimary: locationDraft.primary || null,
          locationSecondary: locationDraft.secondary || null,
          locationTertiary: locationDraft.tertiary || null,
        }),
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

      // Update notification preferences
      const prefRes = await fetchUser('/notification-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allowPartnerOffers,
          allowPlatformUpdates,
          preferredLanguage,
          preferredContactMethod,
        }),
      });

      if (!prefRes.ok) throw new Error(await prefRes.text());

      setUserLocation(locationDraft);

      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const closePasswordModal = () => {
    setPasswordModalOpen(false);
    setPasswordDraft('');
    setPasswordConfirm('');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !user) return;
    if (passwordDraft.trim().length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (passwordDraft !== passwordConfirm) {
      toast.error('Passwords do not match');
      return;
    }

    setPasswordSaving(true);
    try {
      const pwRes = await fetchUser('/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: passwordDraft }),
      });

      if (!pwRes.ok) {
        const contentType = pwRes.headers.get('content-type');
        const errorText = contentType?.includes('application/json')
          ? (await pwRes.json()).message
          : await pwRes.text();
        throw new Error(errorText || 'Failed to update password');
      }

      closePasswordModal();
      toast.success('Password updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  // Show loading state while auth is initializing
  if (isLoggedIn === undefined || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7f2e8_0%,#fffaf4_52%,#f4efe6_100%)] px-4">
        <div className="rounded-[28px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-6 py-5 text-sm text-slate-700 shadow-[0_18px_50px_rgba(81,55,32,0.08)] backdrop-blur-sm">
          {t('saving')}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f2e8_0%,#fffaf4_52%,#f4efe6_100%)] px-3 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] px-6 py-7 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff7f50]">Client Workspace</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{t('title')}</h1>
              <p className="mt-2 text-sm text-slate-700">{t('subtitle')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[rgba(255,250,240,0.88)] px-3 py-1 text-xs font-semibold text-[#ff7f50] ring-1 ring-[rgba(120,53,15,0.12)]">
                  Profile completeness {profileCompletion}%
                </span>
                <span className="rounded-full bg-[rgba(255,250,240,0.88)] px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-[rgba(120,53,15,0.12)]">
                  Preferred contact {preferredContactMethod}
                </span>
                <span className="rounded-full bg-[rgba(255,250,240,0.88)] px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-[rgba(120,53,15,0.12)]">
                  Area {locationSummary}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(255,250,240,0.82)] px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(255,250,240,0.96)]"
            >
              Change password
            </button>
          </div>
        </div>

        <form id="client-profile-form" onSubmit={handleSaveProfile} className="space-y-6 pb-24">
          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <section className={paperCardClassName}>
              <div className="mb-6 flex flex-col gap-3 border-b border-[rgba(120,53,15,0.1)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Profile details</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">{t('accountInfo')}</h2>
                </div>
                <div className="min-w-[180px]">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800">Ready to use</span>
                    <span className="font-bold text-[#16a34a]">{profileCompletion}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[rgba(204,179,152,0.34)]">
                    <div
                      className="h-full rounded-full bg-[#16a34a] transition-all"
                      style={{ width: `${Math.max(8, profileCompletion)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={sectionLabelClassName}>{t('email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={paperInputClassName}
                    required
                  />
                </div>

                <div>
                  <label className={sectionLabelClassName}>{t('firstName')}</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={paperInputClassName}
                  />
                </div>

                <div>
                  <label className={sectionLabelClassName}>{t('surname')}</label>
                  <input
                    type="text"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    className={paperInputClassName}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={sectionLabelClassName}>Mobile number</label>
                  <input
                    type="text"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className={paperInputClassName}
                    placeholder="e.g. +852 9123 4567"
                  />
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <section className={paperCardClassName}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Account snapshot</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{t('accountDetails')}</h2>
                <div className="mt-5 space-y-4 text-sm text-slate-700">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{t('accountType')}</p>
                    <span className="mt-2 inline-flex rounded-full bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white">
                      {user.role === 'professional' ? 'Contractor' : user.role === 'reseller' ? 'Reseller' : user.role === 'surveyor' ? 'Surveyor' : user.role === 'mimo_boh' ? 'Operations' : user.role === 'admin' ? 'Admin' : 'Client'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{t('userId')}</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">{user.id}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Password</p>
                    <p className="mt-2 text-sm text-slate-700">Handled separately for security. Use the hero action to update it.</p>
                  </div>
                </div>
              </section>

            </aside>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className={paperCardClassName}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Preferences</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Notification preferences</h2>
              <div className="mt-5 space-y-5">
                <label className="flex items-start gap-3 rounded-2xl border border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.82)] px-4 py-4 text-sm text-slate-700 shadow-sm">
                  <input
                    type="checkbox"
                    id="allowPartnerOffers"
                    checked={allowPartnerOffers}
                    onChange={(e) => setAllowPartnerOffers(e.target.checked)}
                    disabled={preferencesLoading}
                    className="mt-0.5 rounded border-[rgba(120,53,15,0.24)]"
                  />
                  <span>Receive news and offers from our registered suppliers and partners</span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.82)] px-4 py-4 text-sm text-slate-700 shadow-sm">
                  <input
                    type="checkbox"
                    id="allowPlatformUpdates"
                    checked={allowPlatformUpdates}
                    onChange={(e) => setAllowPlatformUpdates(e.target.checked)}
                    disabled={preferencesLoading}
                    className="mt-0.5 rounded border-[rgba(120,53,15,0.24)]"
                  />
                  <span>Receive news and updates about the Mimo platform and its associates</span>
                </label>

                <div>
                  <label htmlFor="preferredLanguage" className={sectionLabelClassName}>
                    Preferred language
                  </label>
                  <select
                    id="preferredLanguage"
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                    disabled={preferencesLoading}
                    className={paperInputClassName}
                  >
                    <option value="en">English</option>
                    <option value="zh-HK">Cantonese (Traditional Chinese)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="preferredContactMethod" className={sectionLabelClassName}>
                    Preferred contact method
                  </label>
                  <select
                    id="preferredContactMethod"
                    value={preferredContactMethod}
                    onChange={(e) =>
                      setPreferredContactMethod(
                        e.target.value as 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT',
                      )
                    }
                    disabled={preferencesLoading}
                    className={paperInputClassName}
                  >
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="SMS">SMS</option>
                    <option value="WECHAT">WeChat</option>
                  </select>
                </div>
              </div>
            </section>

            <section className={paperCardClassName}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Default browsing area</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{t('defaultLocation')}</h2>
              <p className="mt-2 text-sm text-slate-700">{t('defaultLocationHint')}</p>
              <div className="mt-4 rounded-2xl border border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.74)] p-4 shadow-sm">
                <MapOrList
                  storageKey="fh-map-or-list-preference"
                  label="Your area"
                  helperText="Pick your district on the map or use Words mode for a text list."
                  mapLabel="Map"
                  listLabel="Words"
                  listPanelClassName="max-h-[50vh] overflow-y-auto pr-1"
                  map={
                    <HkDistrictMap
                      selectionMode="single"
                      selectedAreaCodes={selectedLocationAreaCode ? [selectedLocationAreaCode] : []}
                      onChange={handleMapLocationSelect}
                    />
                  }
                  list={
                    <HkDistrictList
                      selectionMode="single"
                      selectedAreaCodes={selectedLocationAreaCode ? [selectedLocationAreaCode] : []}
                      onChange={handleMapLocationSelect}
                    />
                  }
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-[rgba(255,250,240,0.88)] px-3 py-1 font-semibold text-[#ff7f50] ring-1 ring-[rgba(120,53,15,0.12)]">
                  Selected: {locationSummary}
                </span>
                <span>Your default location is saved when you use Save Changes.</span>
              </div>
              <details className="mt-4 text-xs text-slate-500">
                <summary className="cursor-pointer select-none">Advanced: set by text</summary>
                <div className="mt-3">
                  <LocationSelect value={locationDraft} onChange={setLocationDraft} enableSearch={true} />
                </div>
              </details>
            </section>
          </div>

          <section className={paperCardClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Session</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Account controls</h2>
            <p className="mt-2 text-sm text-slate-700">High-impact actions should sit here. Delete account can be wired later once the correct confirmation flow is ready.</p>
            <button
              type="button"
              className="mt-5 rounded-2xl bg-[crimson] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#b01030]"
            >
              Delete account
            </button>
            <p className="mt-2 text-xs text-slate-500">No action is connected yet.</p>
          </section>
        </form>

        <div className="pointer-events-none sticky bottom-4 z-20 flex justify-end">
          <button
            type="submit"
            form="client-profile-form"
            disabled={saving}
            className="pointer-events-auto rounded-full bg-[#16a34a] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[rgba(81,55,32,0.18)] transition hover:bg-[#15803d] disabled:opacity-60"
          >
            {saving ? t('saving') : t('saveChanges')}
          </button>
        </div>

        {passwordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,24,16,0.48)] px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[28px] border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.96)] p-6 shadow-[0_30px_80px_rgba(33,24,16,0.28)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Security</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Change password</h2>
                  <p className="mt-2 text-sm text-slate-700">Set a new password separately from your profile details so account updates stay focused.</p>
                </div>
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-full border border-[rgba(120,53,15,0.14)] px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-[rgba(239,231,207,0.7)]"
                >
                  Close
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleChangePassword}>
                <div>
                  <label className={sectionLabelClassName}>New password</label>
                  <input
                    type="password"
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    className={paperInputClassName}
                    placeholder={t('passwordHint')}
                    autoFocus
                  />
                  <p className="mt-2 text-xs text-slate-500">{t('passwordNote')}</p>
                </div>

                <div>
                  <label className={sectionLabelClassName}>Confirm new password</label>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className={paperInputClassName}
                    placeholder="Re-enter your new password"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closePasswordModal}
                    className="rounded-2xl border border-[rgba(120,53,15,0.14)] px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-[rgba(239,231,207,0.7)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="rounded-2xl bg-[#b94e2d] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a84426] disabled:opacity-60"
                  >
                    {passwordSaving ? t('saving') : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
