"use client";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/config/api";

type Pattern = {
  id: string;
  name: string;
  pattern: string;
  matchType: string;
  category: string;
  notes?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  mapsTo?: string | null;
  _source?: 'core' | 'user';
};

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

const CATEGORIES = ['service', 'location', 'trade', 'supply', 'intent'] as const;

export default function AdminPatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<'all' | 'core' | 'user'>('all');
  const [editing, setEditing] = useState<Pattern | null>(null);
  const [creating, setCreating] = useState(false);
  const [itemsToShow, setItemsToShow] = useState(20);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => { void fetchPatterns(); }, []);

  async function fetchPatterns() {
    try {
      const res = await fetch(`${API_BASE_URL}/patterns?includeCore=true`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPatterns(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return patterns.filter(p =>
      (sourceFilter === 'all' || p._source === sourceFilter) &&
      (categoryFilter === '' || p.category === categoryFilter) &&
      (!q ||
      p.name.toLowerCase().includes(q) ||
      p.pattern.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.matchType.toLowerCase().includes(q))
    );
  }, [patterns, filter, categoryFilter, sourceFilter]);

  async function savePattern(body: Partial<Pattern>) {
    const res = await fetch(`${API_BASE_URL}/patterns${editing ? `/${editing.id}` : ''}`, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    setEditing(null); setCreating(false);
    await fetchPatterns();
  }

  async function deletePattern(id: string) {
    const res = await fetch(`${API_BASE_URL}/patterns/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    await fetchPatterns();
  }

  if (loading) {
    return <div className="text-center text-slate-600">Loading patterns...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="text-slate-300 hover:text-white transition"
                title="Learn how patterns work"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
            <h1 className="text-2xl font-bold leading-tight">Patterns</h1>
            <p className="text-sm text-slate-200/90">{patterns.length} total patterns ({patterns.filter(p => p._source === 'core').length} core, {patterns.filter(p => p._source === 'user').length} custom)</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Enabled</p>
              <p className="text-lg font-bold text-emerald-300">{patterns.filter(p=>p.enabled).length}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Service</p>
              <p className="text-lg font-bold text-white">{patterns.filter(p=>p.category==='service').length}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Location</p>
              <p className="text-lg font-bold text-white">{patterns.filter(p=>p.category==='location').length}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Core</p>
              <p className="text-lg font-bold text-amber-200">{patterns.filter(p=>p._source==='core').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions/Filters */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => { setCreating(true); setEditing(null); }}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Create Pattern
          </button>
        </div>

        {/* Source Filter Buttons */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider py-1.5">Show:</span>
          <button
            onClick={() => setSourceFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              sourceFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Patterns
          </button>
          <button
            onClick={() => setSourceFilter('core')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              sourceFilter === 'core'
                ? 'bg-amber-600 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Core Only ({patterns.filter(p => p._source === 'core').length})
          </button>
          <button
            onClick={() => setSourceFilter('user')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              sourceFilter === 'user'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Custom ({patterns.filter(p => p._source === 'user').length})
          </button>
        </div>
        
        {/* Category Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter('')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              categoryFilter === ''
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Categories
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                categoryFilter === cat
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, pattern, category..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 pr-8 text-sm text-slate-900"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              aria-label="Clear search"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Pattern</th>
                <th className="px-3 py-2 text-left font-semibold">Match Type</th>
                <th className="px-3 py-2 text-left font-semibold">Category</th>
                <th className="px-3 py-2 text-left font-semibold">Maps To</th>
                <th className="px-3 py-2 text-left font-semibold">Source</th>
                <th className="px-3 py-2 text-left font-semibold">Enabled</th>
                <th className="px-3 py-2 text-right font-semibold">Updated</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, itemsToShow).map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${p._source === 'core' ? 'bg-amber-50' : ''}`}>
                  <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3 py-2 text-slate-700 break-all text-xs">{p.pattern}</td>
                  <td className="px-3 py-2 text-slate-700 text-xs">{p.matchType}</td>
                  <td className="px-3 py-2 text-slate-700 text-xs">{p.category}</td>
                  <td className="px-3 py-2 text-slate-700 text-xs font-semibold">
                    {p.mapsTo ? (
                      <span className="inline-block rounded-full bg-cyan-100 px-2 py-1 text-cyan-900">
                        → {p.mapsTo}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                      p._source === 'core' 
                        ? 'bg-amber-200 text-amber-900' 
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {p._source === 'core' ? 'Core' : 'Custom'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{p.enabled ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs">{formatDate(p.updatedAt)}</td>
                  <td className="px-3 py-2 text-right flex items-center justify-end gap-1">
                    {p._source === 'user' && (
                      <>
                        <button
                          onClick={() => { setEditing(p); setCreating(false); }}
                          className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 transition"
                          title="Edit pattern"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deletePattern(p.id)}
                          className="rounded-md p-1.5 text-rose-700 hover:bg-rose-50 transition"
                          title="Delete pattern"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                    {p._source === 'core' && (
                      <span className="text-xs text-slate-400 italic">Read-only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > itemsToShow && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              onClick={() => setItemsToShow((prev) => prev + 20)}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Show Next 20 Results ({filtered.length - itemsToShow} remaining)
            </button>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-xl font-bold text-slate-900">{editing ? `Edit ${editing.name}` : 'Create Pattern'}</h2>
            </div>
            <div className="space-y-3 px-6 py-4">
              <div className="grid gap-1">
                <label className="text-xs font-medium text-slate-600">Name</label>
                <input className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  defaultValue={editing?.name}
                  onChange={(e) => setEditing(prev => (prev ? { ...prev, name: e.target.value } : { ...(prev as any), name: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-medium text-slate-600">Pattern</label>
                <input className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  defaultValue={editing?.pattern}
                  onChange={(e) => setEditing(prev => (prev ? { ...prev, pattern: e.target.value } : { ...(prev as any), pattern: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-medium text-slate-600">Match Type</label>
                <select className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  defaultValue={editing?.matchType ?? 'contains'}
                  onChange={(e) => setEditing(prev => (prev ? { ...prev, matchType: e.target.value } : { ...(prev as any), matchType: e.target.value }))}
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="startsWith">startsWith</option>
                  <option value="endsWith">endsWith</option>
                  <option value="regex">regex</option>
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-medium text-slate-600">Category</label>
                <select className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  defaultValue={editing?.category ?? 'service'}
                  onChange={(e) => setEditing(prev => (prev ? { ...prev, category: e.target.value } : { ...(prev as any), category: e.target.value }))}
                >
                  <option value="service">service</option>
                  <option value="location">location</option>
                  <option value="trade">trade</option>
                  <option value="supply">supply</option>
                  <option value="intent">intent</option>
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-medium text-slate-600">Notes</label>
                <textarea className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  defaultValue={editing?.notes}
                  onChange={(e) => setEditing(prev => (prev ? { ...prev, notes: e.target.value } : { ...(prev as any), notes: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" defaultChecked={editing?.enabled ?? true}
                  onChange={(e) => setEditing(prev => (prev ? { ...prev, enabled: e.target.checked } : { ...(prev as any), enabled: e.target.checked }))}
                /> Enabled
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
              <button onClick={() => { setEditing(null); setCreating(false); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={() => savePattern(editing ?? { enabled: true })} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-200 px-6 py-4 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">How Pattern Matching Works</h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-4 text-sm text-slate-700">
              <div>
                <h3 className="font-bold text-slate-900 mb-2">The Formula</h3>
                <div className="bg-slate-100 rounded-md p-3 font-mono text-xs space-y-2">
                  <div>If user input <span className="bg-cyan-200 px-1">contains</span> "<span className="text-emerald-700">leaky pipe</span>"</div>
                  <div>→ Show them <span className="bg-cyan-200 px-1">plumber</span> professionals</div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-2">Example Patterns</h3>
                <div className="space-y-2">
                  <div className="border border-slate-200 rounded p-3">
                    <div className="font-semibold text-slate-900">Pattern: "leaky pipe"</div>
                    <div className="text-xs text-slate-600 mt-1">Match Type: <span className="bg-slate-100 px-1">contains</span></div>
                    <div className="text-xs text-slate-600">Maps To: <span className="bg-cyan-100 text-cyan-900 px-1 rounded">plumber</span></div>
                    <div className="text-xs text-slate-600 mt-2">When user searches "I have a leaky pipe" → Shows plumbers</div>
                  </div>
                  <div className="border border-slate-200 rounded p-3">
                    <div className="font-semibold text-slate-900">Pattern: "electric|elec"</div>
                    <div className="text-xs text-slate-600 mt-1">Match Type: <span className="bg-slate-100 px-1">regex</span></div>
                    <div className="text-xs text-slate-600">Maps To: <span className="bg-cyan-100 text-cyan-900 px-1 rounded">electrician</span></div>
                    <div className="text-xs text-slate-600 mt-2">Matches both "electrical" and "elec" → Shows electricians</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-2">Match Types</h3>
                <div className="space-y-1 text-xs">
                  <div><span className="font-semibold bg-slate-100 px-1 rounded">contains</span> - Text appears anywhere ("water" finds "water pipe")</div>
                  <div><span className="font-semibold bg-slate-100 px-1 rounded">equals</span> - Exact match only ("plumber" ≠ "plumbers")</div>
                  <div><span className="font-semibold bg-slate-100 px-1 rounded">startsWith</span> - Matches the beginning ("plumb" finds "plumbing")</div>
                  <div><span className="font-semibold bg-slate-100 px-1 rounded">endsWith</span> - Matches the end ("ing" finds "plumbing")</div>
                  <div><span className="font-semibold bg-slate-100 px-1 rounded">regex</span> - Advanced: "pipe|plumb|water" matches any of these</div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-2">Core vs Custom Patterns</h3>
                <div className="space-y-2">
                  <div className="border border-amber-200 bg-amber-50 rounded p-3">
                    <div className="font-semibold text-amber-900">🔒 Core Patterns (Hardcoded)</div>
                    <div className="text-xs text-amber-800 mt-1">130+ built-in patterns. These are the foundation of the matching system. <strong>Read-only</strong> - cannot be edited or deleted.</div>
                  </div>
                  <div className="border border-emerald-200 bg-emerald-50 rounded p-3">
                    <div className="font-semibold text-emerald-900">✏️ Custom Patterns (Database)</div>
                    <div className="text-xs text-emerald-800 mt-1">Patterns you create. Fully editable and deletable. Add new matching rules without code changes.</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-2">When to Add Custom Patterns</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>You notice users search with words not in core patterns</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>You want to add new synonyms ("roof work" → "roofer")</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>You need to adjust matching without deploying code</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-rose-600 font-bold">✗</span>
                    <span>Don't break core patterns - they've been tested extensively</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="font-semibold text-blue-900 mb-1">⚡ Impact of Changes</div>
                <div className="text-xs text-blue-800">Changes take effect immediately when you save. Affects searches across the platform in real-time. Test thoroughly before deploying to production.</div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
