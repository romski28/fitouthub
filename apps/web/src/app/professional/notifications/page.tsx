'use client';

import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NotificationPreferencesForm } from '@/components/notification-preferences-form';

export default function NotificationPreferencesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is authenticated by seeing if they have a token
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Notification Preferences</h1>
        <p className="mt-2 text-gray-600">
          Manage how you receive notifications from FitOutHub
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <NotificationPreferencesForm />
      </div>
    </div>
  );
}
