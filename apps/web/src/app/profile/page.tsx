'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import LocationSelect, { type CanonicalLocation } from '@/components/location-select';

export default function ProfilePage() {
  const { isLoggedIn, user, logout, userLocation, setUserLocation } = useAuth();
  const router = useRouter();
  const [locationDraft, setLocationDraft] = useState<CanonicalLocation>(userLocation || ({} as CanonicalLocation));
  const [locationSaved, setLocationSaved] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  // Show loading state while auth is initializing
  if (isLoggedIn === undefined || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-600">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">My Profile</h1>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Nickname
              </label>
              <p className="text-lg text-slate-900">{user.nickname}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Email
              </label>
              <p className="text-lg text-slate-900">{user.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                First Name
              </label>
              <p className="text-lg text-slate-900">{user.firstName}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Surname
              </label>
              <p className="text-lg text-slate-900">{user.surname}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Account Type
              </label>
              <span className="inline-block text-lg font-medium text-white bg-blue-600 px-3 py-1 rounded">
                {user.role === 'professional' ? 'Contractor' : user.role === 'reseller' ? 'Reseller' : 'Client'}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                User ID
              </label>
              <p className="text-sm text-slate-600 font-mono">{user.id}</p>
            </div>
          </div>

          {user.role === 'professional' && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <a
                href="/professional/edit"
                className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
              >
                Edit Professional Profile
              </a>
            </div>
          )}

          {/* Default location for browsing trades/professionals */}
          <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">Default location</h2>
            <p className="text-sm text-slate-600">
              Set your preferred location to prefill searches for trades and professionals.
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
              Save default location
            </button>
            {locationSaved ? (
              <p className="text-sm text-green-700">Location saved.</p>
            ) : null}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={logout}
              className="rounded-md bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
