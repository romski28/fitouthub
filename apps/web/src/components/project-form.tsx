'use client';

import { useState, useMemo, useEffect } from 'react';
import LocationSelect, { CanonicalLocation } from './location-select';
import FileUploader from './file-uploader';
import { Professional } from '@/lib/types';
import { API_BASE_URL } from '@/config/api';

export interface ProjectFormData {
  projectName: string;
  clientName: string;
  region: string;
  budget?: string | number;
  notes: string;
  selectedService?: string;
  location?: CanonicalLocation;
  files?: File[];
  tradesRequired: string[];
  isEmergency?: boolean;
  endDate?: string; // ISO date string (YYYY-MM-DD)
}

interface ProjectFormProps {
  /** Form mode: 'create' for new project, 'edit' for existing, 'view' for read-only */
  mode?: 'create' | 'edit' | 'view';
  
  /** Initial form data - pre-populates fields */
  initialData?: Partial<ProjectFormData>;
  
  /** Professionals to invite (optional) */
  professionals?: Professional[];
  
  /** Single professional for quick project request flow */
  singleProfessional?: Professional | null;
  
  /** Whether this is a quick request (shorthand form) vs full creation form */
  isQuickRequest?: boolean;
  
  /** Form submission handler */
  onSubmit: (data: ProjectFormData) => Promise<void>;
  onAssistRequest?: (data: ProjectFormData) => Promise<void>;
  
  /** Cancel handler */
  onCancel?: () => void;
  
  /** Is the form currently submitting */
  isSubmitting?: boolean;
  
  /** Error message to display */
  error?: string | null;
  
  /** Custom label for submit button */
  submitLabel?: string;
  
  /** Whether to show budget field */
  showBudget?: boolean;
  
  /** Whether to show service selection */
  showService?: boolean;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ProjectForm({
  mode = 'create',
  initialData,
  professionals,
  singleProfessional,
  isQuickRequest = false,
  onSubmit,
  onAssistRequest,
  onCancel,
  isSubmitting = false,
  error,
  submitLabel,
  showBudget = true,
  showService = true,
}: ProjectFormProps) {
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: initialData?.projectName || '',
    clientName: initialData?.clientName || '',
    region: initialData?.region || '',
    budget: initialData?.budget || '',
    notes: initialData?.notes || '',
    selectedService: initialData?.selectedService || '',
    location: initialData?.location || {},
    files: initialData?.files || [],
    tradesRequired: initialData?.tradesRequired || [],
    isEmergency: initialData?.isEmergency ?? false,
    endDate: initialData?.endDate || '',
  });

  const [availableTrades, setAvailableTrades] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [showTradeDropdown, setShowTradeDropdown] = useState(false);
  const [tradeSearchTerm, setTradeSearchTerm] = useState('');
  const isReadOnly = mode === 'view';

  // Fetch available trades from API
  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/trades`);
        if (res.ok) {
          const data = await res.json();
          setAvailableTrades(data.map((t: { id: string; name: string; category: string }) => ({
            id: t.id,
            name: t.name,
            category: t.category,
          })));
        }
      } catch (err) {
        console.warn('[ProjectForm] Failed to fetch trades:', err);
      }
    };
    fetchTrades();
  }, []);

  const filteredTrades = useMemo(() => {
    if (!tradeSearchTerm.trim()) return availableTrades;
    const search = tradeSearchTerm.toLowerCase();
    return availableTrades.filter(t => 
      t.name.toLowerCase().includes(search) || 
      t.category.toLowerCase().includes(search)
    );
  }, [tradeSearchTerm, availableTrades]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTradeDropdown) {
        setShowTradeDropdown(false);
      }
    };
    if (showTradeDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showTradeDropdown]);

  const displayNames = useMemo(() => {
    if (singleProfessional) {
      return [singleProfessional.fullName || singleProfessional.businessName || 'Professional'];
    }
    if (professionals) {
      return professionals.map((p) => p.fullName || p.businessName || 'Professional');
    }
    return [];
  }, [singleProfessional, professionals]);

  const handleChange = (field: keyof ProjectFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLocationChange = (loc: CanonicalLocation) => {
    setFormData((prev) => ({ ...prev, location: loc }));
  };

  const handleFilesChange = (files: File[]) => {
    setFormData((prev) => ({ ...prev, files }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const handleAssistClick = async () => {
    if (!onAssistRequest) return;
    await onAssistRequest(formData);
  };

  // Quick request form (compact)
  if (isQuickRequest) {
    return (
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Project Title */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Project Title</label>
          <input
            type="text"
            value={formData.projectName}
            onChange={(e) => handleChange('projectName', e.target.value)}
            disabled={isReadOnly || isSubmitting}
            placeholder="e.g. Plumber in Central"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </div>

        {/* Location */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Project Location</label>
          <LocationSelect
            value={formData.location || {}}
            onChange={handleLocationChange}
            disabled={isReadOnly || isSubmitting}
          />
        </div>

        {/* Description */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Describe the Project</label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            rows={4}
            disabled={isReadOnly || isSubmitting}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            placeholder="Describe your project scope, requirements, and any specific needs..."
            required
          />
        </div>

        {/* Trades Required */}
        {showService && (
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Required Trades/Services</label>
            <div className="flex flex-wrap gap-2 rounded-md border border-slate-300 px-3 py-2 min-h-[42px]">
              {formData.tradesRequired.map((trade, idx) => (
                <span
                  key={`${trade}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
                >
                  {trade}
                  <button
                    type="button"
                    onClick={() => handleChange('tradesRequired', formData.tradesRequired.filter((_, i) => i !== idx))}
                    disabled={isReadOnly || isSubmitting}
                    className="hover:text-blue-900 disabled:opacity-50"
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="flex gap-2 w-full">
                <select
                  value={tradeSearchTerm}
                  onChange={(e) => setTradeSearchTerm(e.target.value)}
                  disabled={isReadOnly || isSubmitting}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a trade...</option>
                  {availableTrades
                    .filter(t => !formData.tradesRequired.includes(t.name))
                    .map((trade) => (
                      <option key={trade.id} value={trade.id}>{trade.name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const trade = availableTrades.find(t => t.id === tradeSearchTerm);
                    if (trade && !formData.tradesRequired.includes(trade.name)) {
                      handleChange('tradesRequired', [...formData.tradesRequired, trade.name]);
                      setTradeSearchTerm('');
                    }
                  }}
                  disabled={isReadOnly || isSubmitting || !tradeSearchTerm}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">Select from available trades or type to search. Click to add.</p>
          </div>
        )}

        {/* File Upload */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Photos (optional)</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onFilesChange={handleFilesChange}
            showUploadAction={false}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting || isReadOnly}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {onAssistRequest && !isReadOnly && (
            <button
              type="button"
              onClick={handleAssistClick}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
            >
              Ask for advice
            </button>
          )}
          {!isReadOnly && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isSubmitting ? `${submitLabel || 'Creating'}...` : submitLabel || 'Create Project'}
            </button>
          )}
        </div>
      </form>
    );
  }

  // Full project creation/edit form
  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      {/* Professional List (if applicable) */}
      {displayNames.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Professional{displayNames.length !== 1 ? 's' : ''} ({displayNames.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {displayNames.map((name, idx) => (
              <span
                key={`${name}-${idx}`}
                className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Project Name */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Project Name {!isReadOnly && '*'}
        </label>
        <input
          type="text"
          required={!isReadOnly}
          placeholder="e.g., Office Fitout, Restaurant Renovation"
          value={formData.projectName}
          onChange={(e) => handleChange('projectName', e.target.value)}
          disabled={isReadOnly || isSubmitting}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base disabled:bg-slate-50 disabled:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Client Name */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Your Name
        </label>
        <input
          type="text"
          placeholder="Your full name"
          value={formData.clientName}
          onChange={(e) => handleChange('clientName', e.target.value)}
          disabled={isReadOnly || isSubmitting}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base disabled:bg-slate-50 disabled:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Region/Location {!isReadOnly && '*'}
        </label>
        <LocationSelect
          value={formData.location || {}}
          onChange={handleLocationChange}
          disabled={isReadOnly || isSubmitting}
        />
      </div>

      {/* Trades Required */}
      {showService && (
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Required Trades/Services {!isReadOnly && '*'}
          </label>
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-300 px-4 py-2.5 min-h-[46px] focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            {formData.tradesRequired.map((trade, idx) => (
              <span
                key={`${trade}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700"
              >
                {trade}
                <button
                  type="button"
                  onClick={() => handleChange('tradesRequired', formData.tradesRequired.filter((_, i) => i !== idx))}
                  disabled={isReadOnly || isSubmitting}
                  className="hover:text-blue-900 disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
            <div className="relative flex-1 min-w-[150px]">
              <input
                type="text"
                value={tradeSearchTerm}
                onChange={(e) => {
                  setTradeSearchTerm(e.target.value);
                  setShowTradeDropdown(true);
                }}
                onFocus={() => setShowTradeDropdown(true)}
                placeholder={formData.tradesRequired.length === 0 ? "Select trades..." : "Add another..."}
                disabled={isReadOnly || isSubmitting}
                required={!isReadOnly && formData.tradesRequired.length === 0}
                className="w-full border-0 bg-transparent px-2 py-1 text-base outline-none disabled:bg-slate-50"
              />
              {showTradeDropdown && filteredTrades.length > 0 && !isReadOnly && !isSubmitting && (
                <div className="absolute top-full left-0 z-10 mt-1 max-h-60 w-full min-w-[250px] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {filteredTrades.slice(0, 20).map((trade) => (
                    <button
                      key={trade.id}
                      type="button"
                      onClick={() => {
                        if (!formData.tradesRequired.includes(trade.name)) {
                          handleChange('tradesRequired', [...formData.tradesRequired, trade.name]);
                        }
                        setTradeSearchTerm('');
                        setShowTradeDropdown(false);
                      }}
                      className="w-full px-3 py-2.5 text-left hover:bg-blue-50 flex items-center justify-between border-b border-slate-100 last:border-0"
                    >
                      <span className="font-medium text-slate-900">{trade.name}</span>
                      <span className="text-xs text-slate-500 uppercase tracking-wide">{trade.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">Select from available trades. Type to search, click to add.</p>
        </div>
      )}

      {/* Budget */}
      {showBudget && (
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Budget (HKD) <span className="text-slate-500 font-normal">(Optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-slate-500 font-medium">$</span>
            <input
              type="number"
              placeholder="100,000"
              value={formData.budget || ''}
              onChange={(e) => handleChange('budget', e.target.value)}
              disabled={isReadOnly || isSubmitting}
              min="0"
              step="1000"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pl-8 text-base disabled:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Project Scope & Notes */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Project Scope & Details <span className="text-slate-500 font-normal">(Optional)</span>
        </label>
        <textarea
          placeholder="Describe your project scope, requirements, timeline, and any specific needs. This helps professionals understand your project better."
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          disabled={isReadOnly || isSubmitting}
          rows={6}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base disabled:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
        <p className="text-xs text-slate-500 mt-1">You can add photos and more details after creating the project.</p>
      </div>

      {/* Timescale */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <input
            id="isEmergency"
            type="checkbox"
            checked={!!formData.isEmergency}
            onChange={(e) => handleChange('isEmergency', e.target.checked)}
            disabled={isReadOnly || isSubmitting}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor="isEmergency" className="text-sm font-medium text-slate-800">This is an emergency</label>
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium text-slate-800">I need this completed by</label>
          <input
            type="date"
            value={formData.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
            disabled={isReadOnly || isSubmitting}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* File Upload */}
      {!isReadOnly && (
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Photos (optional)</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onFilesChange={handleFilesChange}
            showUploadAction={false}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting || isReadOnly}
            className="flex-1 rounded-lg border border-slate-300 px-6 py-2.5 text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {!isReadOnly && (
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isSubmitting ? `${submitLabel || 'Creating Project'}...` : submitLabel || 'Create Project'}
          </button>
        )}
      </div>

      {/* Info Box */}
      {mode === 'create' && (
        <div className="mt-8 pt-8 border-t border-slate-200">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Next Step:</strong> After creating your project, you&apos;ll be able to search and invite professionals to submit quotes. We&apos;ll help you compare quotes, negotiate, and award the project.
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
