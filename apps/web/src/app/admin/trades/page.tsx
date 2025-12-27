'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

interface Trade {
  id: string;
  name: string;
  category: string;
  professionType?: string;
  aliases: string[];
  description?: string;
  enabled: boolean;
  featured: boolean;
  sortOrder: number;
  usageCount: number;
  serviceMappings?: ServiceMapping[];
}

interface ServiceMapping {
  id: string;
  keyword: string;
  confidence: number;
  enabled: boolean;
  usageCount: number;
}

export default function TradesAdminPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [formData, setFormData] = useState<Partial<Trade>>({});
  const [mappingKeyword, setMappingKeyword] = useState('');

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/trades`);
      const data = await res.json();
      setTrades(data);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTradeDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/trades/${id}`);
      const data = await res.json();
      setSelectedTrade(data);
    } catch (error) {
      console.error('Failed to fetch trade detail:', error);
    }
  };

  const handleCreateTrade = async () => {
    try {
      await fetch(`${API_BASE_URL}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setShowAddTrade(false);
      setFormData({});
      fetchTrades();
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
      fetchTrades();
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
      fetchTrades();
    } catch (error) {
      console.error('Failed to delete trade:', error);
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
      fetchTrades();
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
      fetchTrades();
    } catch (error) {
      console.error('Failed to delete mapping:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading trades...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Trades & Services</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage professional trades and service keyword mappings
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddTrade(true);
            setFormData({ category: 'contractor', enabled: true, featured: false, sortOrder: 999, aliases: [] });
          }}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Add Trade
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trades List */}
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

        {/* Trade Detail / Add Trade Form */}
        <div>
          {showAddTrade ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Add New Trade</h2>
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
                    value={formData.aliases?.join(', ') || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g., Plumbing, Drainage Specialist"
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
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedTrade.name}</h2>
                  <p className="text-sm text-slate-600 mt-1">
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

              {selectedTrade.description && (
                <p className="text-sm text-slate-600 mb-4">{selectedTrade.description}</p>
              )}

              {selectedTrade.aliases && selectedTrade.aliases.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Aliases:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedTrade.aliases.map((alias, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
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

                <div className="space-y-1 max-h-[400px] overflow-y-auto">
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
                    <p className="text-xs text-slate-500 py-4 text-center">No service mappings yet</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-sm text-slate-600">Select a trade to view details and manage service mappings</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
