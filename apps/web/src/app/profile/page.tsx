'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import LocationSelect, { type CanonicalLocation } from '@/components/location-select';
import { toast } from 'react-hot-toast';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';

export default function ProfilePage() {
  const { isLoggedIn, user, accessToken, logout, userLocation, setUserLocation } = useAuth();
  const router = useRouter();
  const [locationDraft, setLocationDraft] = useState<CanonicalLocation>(userLocation || ({} as CanonicalLocation));
  const [locationSaved, setLocationSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [password, setPassword] = useState('');

  // Load user data into form
  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setFirstName(user.firstName || '');
      setSurname(user.surname || '');
    }
  }, [user]);

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

      if (!res.ok) throw new Error(await res.text());

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

        if (!pwRes.ok) throw new Error(await pwRes.text());
        setPassword('');
      }

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
        <p className="text-slate-600">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white rounded-lg border border-slate-200 p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-600 mt-1">Manage your account details and settings</p>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4 pt-6 border-t border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Account Information</h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
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
              <label className="block text-sm font-medium text-slate-700">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Surname</label>
              <input
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Minimum 6 characters"
            />
            <p className="mt-1 text-xs text-slate-500">Leave blank to keep your current password</p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Default location for browsing trades/professionals */}
        <div className="pt-6 border-t border-slate-200 space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Default Location</h2>
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
            Save Default Location
          </button>
          {locationSaved ? (
            <p className="text-sm text-green-700">Location saved.</p>
          ) : null}
        </div>

        {/* Account Info */}
        <div className="pt-6 border-t border-slate-200 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">Account Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-slate-600">Account Type</label>
              <span className="inline-block font-medium text-white bg-blue-600 px-3 py-1 rounded mt-1">
                {user.role === 'professional' ? 'Contractor' : user.role === 'reseller' ? 'Reseller' : 'Client'}
              </span>
            </div>
            <div>
              <label className="block text-slate-600">User ID</label>
              <p className="text-slate-900 font-mono mt-1">{user.id}</p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200">
          <button
            onClick={logout}
            className="rounded-md bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
