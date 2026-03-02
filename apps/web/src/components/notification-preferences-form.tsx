'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';

interface NotificationPreference {
  id: string;
  primaryChannel: 'WHATSAPP' | 'SMS' | 'WECHAT' | 'EMAIL';
  fallbackChannel: 'WHATSAPP' | 'SMS' | 'WECHAT' | 'EMAIL';
  enableSMS: boolean;
  enableWhatsApp: boolean;
  enableWeChat: boolean;
  enableEmail: boolean;
  weChatOpenId: string | null;
}

const CHANNEL_OPTIONS = [
  { value: 'WHATSAPP', label: 'WhatsApp', icon: '📱' },
  { value: 'SMS', label: 'SMS', icon: '💬' },
  { value: 'WECHAT', label: 'WeChat', icon: '🪙' },
  { value: 'EMAIL', label: 'Email', icon: '📧' },
];

export function NotificationPreferencesForm() {
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/notifications/preferences/me`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load notification preferences');
      }

      const data = await response.json();
      setPreferences(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Failed to fetch preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChannelToggle = (field: keyof NotificationPreference, value: boolean) => {
    if (preferences) {
      setPreferences({ ...preferences, [field]: value });
    }
  };

  const handleChannelChange = (field: 'primaryChannel' | 'fallbackChannel', value: string) => {
    if (preferences) {
      setPreferences({
        ...preferences,
        [field]: value as 'WHATSAPP' | 'SMS' | 'WECHAT' | 'EMAIL',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences) return;

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/notifications/preferences/me`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            primaryChannel: preferences.primaryChannel,
            fallbackChannel: preferences.fallbackChannel,
            enableSMS: preferences.enableSMS,
            enableWhatsApp: preferences.enableWhatsApp,
            enableWeChat: preferences.enableWeChat,
            enableEmail: preferences.enableEmail,
            weChatOpenId: preferences.weChatOpenId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
      console.error('Failed to save preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-600">Loading preferences...</p>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-700">Failed to load notification preferences</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Primary Channel Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-gray-900">
          Primary Communication Channel
        </label>
        <p className="text-sm text-gray-600">
          This is your preferred way to receive notifications
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CHANNEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChannelChange('primaryChannel', option.value)}
              className={`rounded-lg border-2 p-3 text-center transition-colors ${
                preferences.primaryChannel === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-2xl">{option.icon}</div>
              <div className="text-xs font-medium text-gray-700">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Fallback Channel Selection */}
      <div className="space-y-3 rounded-lg bg-yellow-50 p-4">
        <label className="block text-sm font-semibold text-gray-900">
          Fallback Channel
        </label>
        <p className="text-sm text-gray-600">
          If your primary channel fails, we'll try this instead
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CHANNEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChannelChange('fallbackChannel', option.value)}
              className={`rounded-lg border-2 p-3 text-center transition-colors ${
                preferences.fallbackChannel === option.value
                  ? 'border-yellow-500 bg-yellow-100'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              disabled={option.value === preferences.primaryChannel}
            >
              <div className="text-2xl">{option.icon}</div>
              <div className="text-xs font-medium text-gray-700">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Individual Channel Toggles */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-gray-900">Enable Channels</label>
        <p className="text-sm text-gray-600">Choose which channels you want to receive notifications on</p>
        
        <div className="space-y-2">
          {[
            { key: 'enableSMS', label: 'SMS', icon: '💬' },
            { key: 'enableWhatsApp', label: 'WhatsApp', icon: '📱' },
            { key: 'enableWeChat', label: 'WeChat', icon: '🪙' },
            { key: 'enableEmail', label: 'Email', icon: '📧' },
          ].map((channel) => (
            <div key={channel.key} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <label className="flex items-center space-x-2">
                <span className="text-lg">{channel.icon}</span>
                <span className="font-medium text-gray-700">{channel.label}</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  handleChannelToggle(
                    channel.key as keyof NotificationPreference,
                    !(preferences[channel.key as keyof NotificationPreference] as boolean)
                  )
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  (preferences[channel.key as keyof NotificationPreference] as boolean)
                    ? 'bg-blue-600'
                    : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    (preferences[channel.key as keyof NotificationPreference] as boolean)
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* WeChat OpenID */}
      {preferences.enableWeChat && (
        <div className="space-y-2">
          <label htmlFor="weChatOpenId" className="block text-sm font-semibold text-gray-900">
            WeChat Open ID (Optional)
          </label>
          <p className="text-sm text-gray-600">Your WeChat identifier for receiving notifications</p>
          <input
            type="text"
            id="weChatOpenId"
            value={preferences.weChatOpenId || ''}
            onChange={(e) => setPreferences({ ...preferences, weChatOpenId: e.target.value })}
            placeholder="wx_..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-700">Preferences saved successfully!</p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        <button
          type="button"
          onClick={fetchPreferences}
          className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      {/* Info Section */}
      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">💡 How it works</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>• We'll send notifications using your primary channel</li>
          <li>• If that fails, we'll automatically try the fallback channel</li>
          <li>• You can enable/disable specific channels anytime</li>
          <li>• Changes take effect immediately</li>
        </ul>
      </div>
    </form>
  );
}
