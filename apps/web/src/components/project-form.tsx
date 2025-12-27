'use client';

import { useState, useEffect, useMemo } from 'react';
import LocationSelect, { CanonicalLocation } from './location-select';
import FileUploader from './file-uploader';
import { Professional } from '@/lib/types';

export interface ProjectFormData {
  projectName: string;
  clientName: string;
  region: string;
  budget?: string | number;
  notes: string;
  selectedService?: string;
  location?: CanonicalLocation;
  files?: File[];
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
  });

  const [serviceOptions, setServiceOptions] = useState<{ label: string; value: string }[]>([]);
  const isReadOnly = mode === 'view';
  const isEditing = mode === 'edit';

  // Generate service options from professionals
  useEffect(() => {
    const options = new Set<string>();
    
    if (singleProfessional) {
      if (singleProfessional.tradesOffered) {
        singleProfessional.tradesOffered.forEach((t) => options.add(t));
      }
      if (singleProfessional.suppliesOffered) {
        singleProfessional.suppliesOffered.forEach((s) => options.add(s));
      }
      if (singleProfessional.primaryTrade) options.add(singleProfessional.primaryTrade);
      if (singleProfessional.professionType) options.add(singleProfessional.professionType);
    }
    
    if (professionals && professionals.length > 0) {
      professionals.forEach((p) => {
        if (p.primaryTrade) options.add(p.primaryTrade);
        (p.tradesOffered ?? []).forEach((t) => options.add(t));
        (p.suppliesOffered ?? []).forEach((s) => options.add(s));
      });
    }

    const sorted = Array.from(options)
      .filter(Boolean)
      .map((value) => ({ label: value, value }))
      .sort((a, b) => a.label.localeCompare(b.label));

    setServiceOptions(sorted);
    if (!formData.selectedService && sorted.length > 0) {
      setFormData((prev) => ({ ...prev, selectedService: sorted[0].value }));
    }
  }, [singleProfessional, professionals, formData.selectedService]);

  const displayNames = useMemo(() => {
    if (singleProfessional) {
      return [singleProfessional.fullName || singleProfessional.businessName || 'Professional'];
    }
    if (professionals) {
      return professionals.map((p) => p.fullName || p.businessName || 'Professional');
    }
    return [];
  }, [singleProfessional, professionals]);

  const handleChange = (field: keyof ProjectFormData, value: any) => {
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

  // Quick request form (compact)
  if (isQuickRequest) {
    return (
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Service Selection */}
        {showService && serviceOptions.length > 0 && (
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Service</label>
            <select
              value={formData.selectedService || ''}
              onChange={(e) => handleChange('selectedService', e.target.value)}
              disabled={isReadOnly || isSubmitting}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              required
            >
              <option value="">Select a service</option>
              {serviceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

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

        {/* File Upload */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Photos (optional)</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onFilesChange={handleFilesChange}
            showUploadAction={false}
            disabled={isReadOnly || isSubmitting}
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
          Your Name {!isReadOnly && '*'}
        </label>
        <input
          type="text"
          required={!isReadOnly}
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

      {/* Service Selection */}
      {showService && serviceOptions.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Service</label>
          <select
            value={formData.selectedService || ''}
            onChange={(e) => handleChange('selectedService', e.target.value)}
            disabled={isReadOnly || isSubmitting}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base disabled:bg-slate-50"
          >
            <option value="">Select a service</option>
            {serviceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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

      {/* File Upload */}
      {!isReadOnly && (
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Photos (optional)</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onFilesChange={handleFilesChange}
            showUploadAction={false}
            disabled={isSubmitting}
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
              <strong>Next Step:</strong> After creating your project, you'll be able to search and invite professionals to submit quotes. We'll help you compare quotes, negotiate, and award the project.
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
