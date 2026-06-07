'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';

type LocaleData = Record<string, Record<string, unknown>>;

export default function AdminI18nPage() {
  const { accessToken, isLoggedIn, user } = useAuth();
  const [data, setData] = useState<LocaleData>({});
  const [loading, setLoading] = useState(true);
  const [activeLocale, setActiveLocale] = useState<'en' | 'zh-HK' | 'zh-CN'>('en');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const locales = [
    { code: 'en' as const, label: 'English' },
    { code: 'zh-HK' as const, label: '廣東話' },
    { code: 'zh-CN' as const, label: '简体中文' },
  ];

  const loadData = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/admin/i18n`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [accessToken]);

  const handleEdit = (key: string, value: unknown) => {
    setEditing(key);
    setEditValue(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  };

  const handleSave = async () => {
    if (!editing || !accessToken) return;
    try {
      setSaving(true);
      let parsedValue: unknown = editValue;
      try { parsedValue = JSON.parse(editValue); } catch { /* keep as string */ }

      const current = { ...data[activeLocale] };
      const parts = editing.split('.');
      let obj: Record<string, unknown> = current;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = parsedValue;

      const res = await fetch(`${API_BASE_URL}/admin/i18n`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ locale: activeLocale, data: current }),
      });

      if (res.ok) {
        setData(prev => ({ ...prev, [activeLocale]: current }));
        setEditing(null);
        setMessage('Saved!');
        setTimeout(() => setMessage(null), 2000);
      } else {
        const err = await res.json();
        setMessage(`Error: ${err.message}`);
      }
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const flattenKeys = (obj: Record<string, unknown>, prefix = ''): Array<{ key: string; value: unknown }> => {
    const result: Array<{ key: string; value: unknown }> = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        result.push({ key: fullKey, value: '[object]' });
        result.push(...flattenKeys(v as Record<string, unknown>, fullKey));
      } else {
        result.push({ key: fullKey, value: v });
      }
    }
    return result;
  };

  const currentData = (data[activeLocale] || {}) as Record<string, unknown>;
  const flatKeys = flattenKeys(currentData);

  // Check which keys are missing in non-English locales
  const enData = (data['en'] || {}) as Record<string, unknown>;
  const enFlatKeys = new Set(flattenKeys(enData).map(k => k.key));
  const missingCount = activeLocale === 'en' ? 0 : flatKeys.filter(k => !enFlatKeys.has(k.key)).length;

  if (!isLoggedIn || user?.role !== 'admin') {
    return <div className="p-8 text-center text-slate-600">Admin access required.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Link href="/admin" className="font-semibold text-slate-900 hover:text-slate-700">Admin Portal</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">i18n Editor</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-slate-900">Translation Editor</h1>
        <p className="text-sm text-slate-500 mt-1">Edit translation files directly. Changes take effect immediately.</p>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-2 text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      <div className="flex gap-2">
        {locales.map(loc => (
          <button
            key={loc.code}
            onClick={() => setActiveLocale(loc.code)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeLocale === loc.code
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {loc.label}
          </button>
        ))}
      </div>

      {activeLocale !== 'en' && missingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          {missingCount} key{missingCount > 1 ? 's' : ''} missing compared to English.
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-semibold text-slate-700 w-[40%]">Key</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Value</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flatKeys.filter(k => !k.key.includes('[object]')).map(({ key, value }) => (
                  <tr key={key} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500 align-top">{key}</td>
                    <td className="px-4 py-2 align-top">
                      {editing === key ? (
                        <textarea
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono min-h-[60px]"
                          rows={3}
                          autoFocus
                        />
                      ) : (
                        <span className="text-slate-800 whitespace-pre-wrap break-all">
                          {typeof value === 'string' ? value : JSON.stringify(value)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right align-top">
                      {editing === key ? (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {saving ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="px-2 py-1 rounded border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEdit(key, value)}
                          className="px-2 py-1 rounded border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
