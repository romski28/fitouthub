'use client';

import { useState } from 'react';
import { matchServiceToProfession } from '@/lib/service-matcher';
import { matchLocation } from '@/lib/location-matcher';
import type { CanonicalLocation } from '@/components/location-select';

interface ProjectDescriptionModalProps {
  isOpen: boolean;
  onSubmit: (data: {
    description: string;
    profession?: string;
    location?: CanonicalLocation;
    tradesRequired: string[];
  }) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

export function ProjectDescriptionModal({
  isOpen,
  onSubmit,
  onCancel,
  title = 'Describe Your Project',
  subtitle = 'Help us understand what you need. We\'ll suggest the right professionals.',
}: ProjectDescriptionModalProps) {
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [matchedProfession, setMatchedProfession] = useState<string | null>(null);
  const [matchedLocation, setMatchedLocation] = useState<CanonicalLocation | null>(null);

  if (!isOpen) return null;

  const handleDescriptionChange = (text: string) => {
    setDescription(text);

    // Real-time pattern matching
    if (text.trim().length > 10) {
      const profession = matchServiceToProfession(text.toLowerCase());
      setMatchedProfession(profession || null);

      const locMatch = matchLocation(text.toLowerCase());
      if (locMatch) {
        // Convert location match to CanonicalLocation
        // Note: matchLocation returns {display, primary, secondary, tertiary, confidence}
        // We need to store the hierarchical structure
        setMatchedLocation({
          primary: locMatch.primary || '',
          secondary: locMatch.secondary || '',
          tertiary: locMatch.tertiary || '',
        });
      } else {
        setMatchedLocation(null);
      }
    } else {
      setMatchedProfession(null);
      setMatchedLocation(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      const profession = matchServiceToProfession(description.toLowerCase()) || undefined;
      const locMatch = matchLocation(description.toLowerCase());

      const tradesRequired = profession ? [profession] : [];
      const location = locMatch
        ? {
            primary: locMatch.primary || '',
            secondary: locMatch.secondary || '',
            tertiary: locMatch.tertiary || '',
          }
        : undefined;

      // Store in sessionStorage for ProjectForm to consume
      sessionStorage.setItem(
        'projectDescription',
        JSON.stringify({
          description,
          profession,
          location,
          tradesRequired,
        })
      );

      onSubmit({
        description,
        profession,
        location,
        tradesRequired,
      });
    } catch (error) {
      console.error('[ProjectDescriptionModal] Error processing description:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-8 space-y-6 animate-in zoom-in duration-200">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description Input */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
              Tell us about your project
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="e.g., 'I need to fix a leaky pipe in my bathroom and update the tile work in Tsim Sha Tsui'"
              rows={5}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Pattern Match Results */}
          {description.trim().length > 10 && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-3 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">Detected from your description:</h3>

              {matchedProfession && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-600">Professional Type:</span>
                  <span className="font-semibold text-slate-900 capitalize">{matchedProfession}</span>
                </div>
              )}

              {matchedLocation && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-600">Location:</span>
                  <span className="font-semibold text-slate-900 capitalize">
                    {[matchedLocation.tertiary, matchedLocation.secondary, matchedLocation.primary]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}

              {!matchedProfession && !matchedLocation && (
                <p className="text-sm text-slate-500 italic">Keep typing to detect profession and location...</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!description.trim() || isProcessing}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
