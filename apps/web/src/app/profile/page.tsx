import React from 'react';
import { useAuth } from '@/context/auth-context';
import { redirect } from 'next/navigation';

export default function ProfilePage() {
  const { isLoggedIn, user, logout } = useAuth();

  // Client-side redirect for protected page
  React.useEffect(() => {
    if (!isLoggedIn) {
      redirect('/');
    }
  }, [isLoggedIn]);

  if (!isLoggedIn || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-600">Redirecting...</p>
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
              <p className="inline-block text-lg font-medium text-white bg-blue-600 px-3 py-1 rounded">
                {user.role === 'professional' ? 'Contractor' : user.role === 'reseller' ? 'Reseller' : 'Client'}
              </p>
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
