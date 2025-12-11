'use client';

import { useState } from 'react';

export interface SearchBoxProps {
  onSubmit: (query: string) => void;
}

const SUGGESTIONS = [
  'Find a plumber',
  'Find an electrician',
  'Join as professional',
  'Register my business',
  'Manage my projects',
];

export default function SearchBox({ onSubmit }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(query.trim());
      setQuery('');
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSubmit(suggestion);
    setQuery('');
    setShowSuggestions(false);
  };

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
          <span className="px-4 text-slate-400">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => setShowSuggestions(query.length > 0 || !query)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="What do you want to do today?"
            className="flex-1 px-4 py-4 outline-none text-lg text-slate-900 placeholder-slate-400"
          />
          <button
            type="submit"
            className="px-6 py-4 bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
          >
            Search
          </button>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
            {query.length === 0 ? (
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Popular Searches</div>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-700 transition flex items-center gap-2"
                  >
                    <span>🔍</span>
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-2">
                <button
                  onClick={() => handleSuggestionClick(query)}
                  type="button"
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-700 transition flex items-center gap-2 font-medium"
                >
                  <span>⏎</span>
                  <span>Search: &quot;{query}&quot;</span>
                </button>
                {SUGGESTIONS.filter((s) =>
                  s.toLowerCase().includes(query.toLowerCase())
                ).map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-700 transition flex items-center gap-2"
                  >
                    <span>🔍</span>
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
