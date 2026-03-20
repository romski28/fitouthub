'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

interface TradeTranslation {
  locale: string;
  name: string;
  description?: string;
  aliases: string[];
  jobs: string[];
}

interface Trade {
  id: string;
  name: string;
  locale: string;
  category: string;
  professionType?: string;
  aliases: string[];
  jobs: string[];
  description?: string;
  enabled: boolean;
  featured: boolean;
  sortOrder: number;
  usageCount: number;
  serviceMappings?: ServiceMapping[];
  translations?: TradeTranslation[];
}

interface ServiceMapping {
  id: string;
  keyword: string;
  confidence: number;
  enabled: boolean;
  usageCount: number;
}

const SUPPORTED_LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'zh-HK', label: 'Cantonese (zh-HK)' },
];

export default function TradesAdminPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [formData, setFormData] = useState<Partial<Trade>>({});
  const [aliasesInput, setAliasesInput] = useState('');
  const [jobsInput, setJobsInput] = useState('');
  const [tradeEditData, setTradeEditData] = useState<Partial<Trade> | null>(null);
  const [editAliasesInput, setEditAliasesInput] = useState('');
  const [mappingKeyword, setMappingKeyword] = useState('');
  const [activeLocale, setActiveLocale] = useState('en');
  const [translationLocale, setTranslationLocale] = useState('zh-HK');
  const [translationName, setTranslationName] = useState('');
  const [translationDescription, setTranslationDescription] = useState('');
  const [translationAliasesInput, setTranslationAliasesInput] = useState('');
  const [translationJobsInput, setTranslationJobsInput] = useState('');
  const [seedLoading, setSeedLoading] = useState(false);

  const parseList = (input: string) =>
    input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  useEffect(() => {
    fetchTrades(activeLocale);
  }, [activeLocale]);

  useEffect(() => {
    if (!selectedTrade) {
      setTradeEditData(null);
      setEditAliasesInput('');
      return;
    }

    setTradeEditData({
      name: selectedTrade.name,
      category: selectedTrade.category,
      professionType: selectedTrade.professionType || '',
      description: selectedTrade.description || '',
      featured: selectedTrade.featured,
      sortOrder: selectedTrade.sortOrder,
      enabled: selectedTrade.enabled,
    });
    setEditAliasesInput((selectedTrade.aliases || []).join(', '));
  }, [selectedTrade]);

  useEffect(() => {
    if (!selectedTrade) {
      setTranslationName('');
      setTranslationDescription('');
      setTranslationAliasesInput('');
      setTranslationJobsInput('');
      return;
    }

    const normalizedLocale = translationLocale.toLowerCase();
    const translation = selectedTrade.translations?.find(
      (item) => item.locale.toLowerCase() === normalizedLocale,
    );

    if (translation) {
      setTranslationName(translation.name || '');
      setTranslationDescription(translation.description || '');
      setTranslationAliasesInput((translation.aliases || []).join(', '));
      setTranslationJobsInput((translation.jobs || []).join(', '));
      return;
    }

    if (normalizedLocale === 'en') {
      setTranslationName(selectedTrade.name || '');
      setTranslationDescription(selectedTrade.description || '');
      setTranslationAliasesInput((selectedTrade.aliases || []).join(', '));
      setTranslationJobsInput((selectedTrade.jobs || []).join(', '));
      return;
    }

    setTranslationName('');
    setTranslationDescription('');
    setTranslationAliasesInput('');
    setTranslationJobsInput('');
  }, [selectedTrade, translationLocale]);

  const fetchTrades = async (locale: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/trades?locale=${encodeURIComponent(locale)}`);
      const data = await res.json();
      setTrades(data);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTradeDetail = async (id: string, locale = activeLocale) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/trades/${id}?locale=${encodeURIComponent(locale)}&includeTranslations=true`,
      );
      const data = await res.json();
      setSelectedTrade(data);
    } catch (error) {
      console.error('Failed to fetch trade detail:', error);
    }
  };

  const handleCreateTrade = async () => {
    try {
      const payload: Partial<Trade> = {
        ...formData,
        aliases: parseList(aliasesInput),
        jobs: parseList(jobsInput),
      };

      await fetch(`${API_BASE_URL}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setShowAddTrade(false);
      setFormData({});
      setAliasesInput('');
      setJobsInput('');
      fetchTrades(activeLocale);
    } catch (error) {
      console.error('Failed to create trade:', error);
    }
  };

  const handleUpdateTrade = async (id: string, updates: Partial<Trade>) => {
    try {
      await fetch(`${API_BASE_URL}/trades/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      fetchTrades(activeLocale);
      if (selectedTrade?.id === id) {
        fetchTradeDetail(id);
      }
    } catch (error) {
      console.error('Failed to update trade:', error);
    }
  };

  const handleDeleteTrade = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trade?')) return;
    try {
      await fetch(`${API_BASE_URL}/trades/${id}`, { method: 'DELETE' });
      setSelectedTrade(null);
      fetchTrades(activeLocale);
    } catch (error) {
      console.error('Failed to delete trade:', error);
    }
  };

  const handleSaveTradeDetails = async () => {
    if (!selectedTrade || !tradeEditData) return;

    await handleUpdateTrade(selectedTrade.id, {
      name: (tradeEditData.name || '').toString().trim(),
      category: (tradeEditData.category || '').toString().trim(),
      professionType: (tradeEditData.professionType || '').toString().trim(),
      description: (tradeEditData.description || '').toString().trim(),
      aliases: parseList(editAliasesInput),
      featured: Boolean(tradeEditData.featured),
      sortOrder:
        typeof tradeEditData.sortOrder === 'number'
          ? tradeEditData.sortOrder
          : Number(tradeEditData.sortOrder || 999),
      enabled: Boolean(tradeEditData.enabled),
    });
  };

  const handleSaveTranslation = async () => {
    if (!selectedTrade) return;
    const name = translationName.trim();
    if (!name) {
      alert('Translation name is required');
      return;
    }

    try {
      await fetch(`${API_BASE_URL}/trades/${selectedTrade.id}/translations/${encodeURIComponent(translationLocale)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: translationDescription.trim(),
          aliases: parseList(translationAliasesInput),
          jobs: parseList(translationJobsInput),
        }),
      });

      await fetchTradeDetail(selectedTrade.id);
      await fetchTrades(activeLocale);
    } catch (error) {
      console.error('Failed to save translation:', error);
    }
  };

  const handleSeedTranslations = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/trades/seed-translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'zh-HK', overwrite: false }),
      });
      const data = await res.json();
      alert(
        `Draft zh-HK translations complete. Created: ${data.created || 0}, Updated: ${data.updated || 0}, Skipped: ${data.skipped || 0}`,
      );
      fetchTrades(activeLocale);
      if (selectedTrade?.id) {
        fetchTradeDetail(selectedTrade.id);
      }
    } catch (error) {
      console.error('Failed to seed translations:', error);
      alert('Failed to seed draft translations. Check API logs/migrations.');
    } finally {
      setSeedLoading(false);
    }
  };

  const handleAddMapping = async () => {
    if (!selectedTrade || !mappingKeyword.trim()) return;
    try {
      await fetch(`${API_BASE_URL}/trades/${selectedTrade.id}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: mappingKeyword.trim().toLowerCase() }),
      });
      setMappingKeyword('');
      setShowAddMapping(false);
      fetchTradeDetail(selectedTrade.id);
      fetchTrades(activeLocale);
    } catch (error) {
      console.error('Failed to add mapping:', error);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!selectedTrade) return;
    try {
      await fetch(`${API_BASE_URL}/trades/mappings/${mappingId}`, {
        method: 'DELETE',
      });
      fetchTradeDetail(selectedTrade.id);
      fetchTrades(activeLocale);
    } catch (error) {
      console.error('Failed to delete mapping:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading trades...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Trades & Services</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage canonical trades and locale-specific translations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeLocale}
            onChange={(e) => setActiveLocale(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale.value} value={locale.value}>
                Browse: {locale.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleSeedTranslations}
            disabled={seedLoading}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {seedLoading ? 'Seeding…' : 'Seed zh-HK Drafts'}
          </button>
          <button
            onClick={() => {
              setShowAddTrade(true);
              setFormData({
                category: 'contractor',
                enabled: true,
                featured: false,
                sortOrder: 999,
                aliases: [],
                jobs: [],
              });
              setAliasesInput('');
              setJobsInput('');
            }}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Add Trade
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">All Trades ({trades.length})</h2>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {trades.map((trade) => (
              <div
                key={trade.id}
                onClick={() => fetchTradeDetail(trade.id)}
                className={`cursor-pointer rounded-lg border p-4 transition ${
                  selectedTrade?.id === trade.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{trade.name}</h3>
                      {trade.featured && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                          Featured
                        </span>
                      )}
                      {!trade.enabled && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {trade.category} • {trade.professionType || 'No profession type'} • {trade.usageCount} uses
                    </p>
                    {trade.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-1">{trade.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {showAddTrade ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Add New Trade</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Category *</label>
                  <select
                    value={formData.category || 'contractor'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  >
                    <option value="contractor">Contractor</option>
                    <option value="company">Company</option>
                    <option value="reseller">Reseller</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Profession Type</label>
                  <input
                    type="text"
                    value={formData.professionType || ''}
                    onChange={(e) => setFormData({ ...formData, professionType: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g., contractor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Aliases (comma-separated)</label>
                  <input
                    type="text"
                    value={aliasesInput}
                    onChange={(e) => setAliasesInput(e.target.value)}
                    onBlur={() =>
                      setFormData({
                        ...formData,
                        aliases: parseList(aliasesInput),
                      })
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g., Plumbing, Drainage Specialist"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Jobs (comma-separated)</label>
                  <input
                    type="text"
                    value={jobsInput}
                    onChange={(e) => setJobsInput(e.target.value)}
                    onBlur={() =>
                      setFormData({
                        ...formData,
                        jobs: parseList(jobsInput),
                      })
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g., install switch, fix socket"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.featured || false}
                      onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-700">Featured</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateTrade}
                    disabled={!formData.name || !formData.category}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Create Trade
                  </button>
                  <button
                    onClick={() => {
                      setShowAddTrade(false);
                      setFormData({});
                      setAliasesInput('');
                      setJobsInput('');
                    }}
                    className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : selectedTrade ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedTrade.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedTrade.category} • {selectedTrade.professionType}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      handleUpdateTrade(selectedTrade.id, { enabled: !selectedTrade.enabled })
                    }
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      selectedTrade.enabled
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {selectedTrade.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeleteTrade(selectedTrade.id)}
                    className="rounded-md bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {tradeEditData && (
                <div className="mb-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Edit Canonical Trade Details</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Name</label>
                      <input
                        type="text"
                        value={tradeEditData.name || ''}
                        onChange={(e) =>
                          setTradeEditData((prev) => ({ ...(prev || {}), name: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Category</label>
                      <input
                        type="text"
                        value={tradeEditData.category || ''}
                        onChange={(e) =>
                          setTradeEditData((prev) => ({ ...(prev || {}), category: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Profession Type</label>
                      <input
                        type="text"
                        value={tradeEditData.professionType || ''}
                        onChange={(e) =>
                          setTradeEditData((prev) => ({ ...(prev || {}), professionType: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Sort Order</label>
                      <input
                        type="number"
                        value={tradeEditData.sortOrder ?? 999}
                        onChange={(e) =>
                          setTradeEditData((prev) => ({ ...(prev || {}), sortOrder: Number(e.target.value) }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700">Description</label>
                      <textarea
                        value={tradeEditData.description || ''}
                        onChange={(e) =>
                          setTradeEditData((prev) => ({ ...(prev || {}), description: e.target.value }))
                        }
                        rows={2}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700">Aliases (comma-separated)</label>
                      <input
                        type="text"
                        value={editAliasesInput}
                        onChange={(e) => setEditAliasesInput(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(tradeEditData.featured)}
                          onChange={(e) =>
                            setTradeEditData((prev) => ({ ...(prev || {}), featured: e.target.checked }))
                          }
                        />
                        Featured
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(tradeEditData.enabled)}
                          onChange={(e) =>
                            setTradeEditData((prev) => ({ ...(prev || {}), enabled: e.target.checked }))
                          }
                        />
                        Enabled
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveTradeDetails}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Save Trade Details
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-4 space-y-3 rounded-md border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Translation Editor</h3>
                  <select
                    value={translationLocale}
                    onChange={(e) => setTranslationLocale(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    {SUPPORTED_LOCALES.map((locale) => (
                      <option key={locale.value} value={locale.value}>
                        {locale.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Localized Name *</label>
                    <input
                      type="text"
                      value={translationName}
                      onChange={(e) => setTranslationName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Localized Description</label>
                    <textarea
                      value={translationDescription}
                      onChange={(e) => setTranslationDescription(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Localized Aliases (comma-separated)</label>
                    <input
                      type="text"
                      value={translationAliasesInput}
                      onChange={(e) => setTranslationAliasesInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Localized Jobs (comma-separated)</label>
                    <input
                      type="text"
                      value={translationJobsInput}
                      onChange={(e) => setTranslationJobsInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTranslation}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Save {translationLocale} Translation
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Service Mappings ({selectedTrade.serviceMappings?.length || 0})
                  </h3>
                  <button
                    onClick={() => setShowAddMapping(true)}
                    className="rounded-md bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    + Add Keyword
                  </button>
                </div>

                {showAddMapping && (
                  <div className="mb-3 flex gap-2">
                    <input
                      type="text"
                      value={mappingKeyword}
                      onChange={(e) => setMappingKeyword(e.target.value)}
                      placeholder="e.g., leaky pipe"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddMapping();
                      }}
                    />
                    <button
                      onClick={handleAddMapping}
                      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddMapping(false);
                        setMappingKeyword('');
                      }}
                      className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="max-h-[400px] space-y-1 overflow-y-auto">
                  {selectedTrade.serviceMappings?.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-900">{mapping.keyword}</span>
                        {!mapping.enabled && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                            Disabled
                          </span>
                        )}
                        {mapping.usageCount > 0 && (
                          <span className="text-xs text-slate-500">({mapping.usageCount} uses)</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteMapping(mapping.id)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {(!selectedTrade.serviceMappings || selectedTrade.serviceMappings.length === 0) && (
                    <p className="py-4 text-center text-xs text-slate-500">No service mappings yet</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-sm text-slate-600">
                Select a trade to view details, translations, and service mappings
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
