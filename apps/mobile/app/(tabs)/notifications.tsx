import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/hooks/use-auth';
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
  { value: 'WHATSAPP', label: 'WhatsApp', emoji: '📱' },
  { value: 'SMS', label: 'SMS', emoji: '💬' },
  { value: 'WECHAT', label: 'WeChat', emoji: '🪙' },
  { value: 'EMAIL', label: 'Email', emoji: '📧' },
];

export default function NotificationSettingsScreen() {
  const { token } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/notifications/preferences/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load preferences');
      }

      const data = await response.json();
      setPreferences(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load notification preferences');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preferences) return;

    try {
      setSaving(true);
      const response = await fetch(`${API_BASE_URL}/notifications/preferences/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          primaryChannel: preferences.primaryChannel,
          fallbackChannel: preferences.fallbackChannel,
          enableSMS: preferences.enableSMS,
          enableWhatsApp: preferences.enableWhatsApp,
          enableWeChat: preferences.enableWeChat,
          enableEmail: preferences.enableEmail,
          weChatOpenId: preferences.weChatOpenId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      Alert.alert('Success', 'Notification preferences saved');
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!preferences) {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-center text-red-600">
          Failed to load notification preferences
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4">
        {/* Primary Channel */}
        <Text className="mb-2 text-lg font-semibold text-gray-900">
          Primary Channel
        </Text>
        <Text className="mb-4 text-gray-600">
          Your preferred way to receive notifications
        </Text>

        <View className="mb-6 gap-2">
          {CHANNEL_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() =>
                setPreferences({
                  ...preferences,
                  primaryChannel: option.value as any,
                })
              }
              className={`rounded-lg border-2 p-3 ${
                preferences.primaryChannel === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <Text className="text-base font-medium text-gray-900">
                {option.emoji} {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fallback Channel */}
        <Text className="mb-2 text-lg font-semibold text-gray-900">
          Fallback Channel
        </Text>
        <Text className="mb-4 text-gray-600">
          Used if your primary channel fails
        </Text>

        <View className="mb-6 gap-2 rounded-lg bg-yellow-50 p-3">
          {CHANNEL_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() =>
                setPreferences({
                  ...preferences,
                  fallbackChannel: option.value as any,
                })
              }
              disabled={option.value === preferences.primaryChannel}
              className={`rounded-lg border-2 p-3 ${
                preferences.fallbackChannel === option.value
                  ? 'border-yellow-500 bg-yellow-100'
                  : 'border-gray-200 bg-white'
              }`}
              opacity={option.value === preferences.primaryChannel ? 0.5 : 1}
            >
              <Text className="text-base font-medium text-gray-900">
                {option.emoji} {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Channel Toggles */}
        <Text className="mb-4 text-lg font-semibold text-gray-900">
          Enable Channels
        </Text>

        <View className="mb-6 gap-3">
          {[
            { key: 'enableSMS', label: 'SMS', emoji: '💬' },
            { key: 'enableWhatsApp', label: 'WhatsApp', emoji: '📱' },
            { key: 'enableWeChat', label: 'WeChat', emoji: '🪙' },
            { key: 'enableEmail', label: 'Email', emoji: '📧' },
          ].map((channel) => (
            <View
              key={channel.key}
              className="flex-row items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
            >
              <Text className="text-base font-medium text-gray-900">
                {channel.emoji} {channel.label}
              </Text>
              <Switch
                value={preferences[channel.key as keyof NotificationPreference] as boolean}
                onValueChange={(value) =>
                  setPreferences({
                    ...preferences,
                    [channel.key]: value,
                  })
                }
              />
            </View>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          className={`rounded-lg p-4 ${
            saving ? 'bg-blue-400' : 'bg-blue-600'
          }`}
        >
          <Text className="text-center text-base font-semibold text-white">
            {saving ? 'Saving...' : 'Save Preferences'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
