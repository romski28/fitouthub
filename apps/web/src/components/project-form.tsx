'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import LocationSelect, { CanonicalLocation } from './location-select';
import FileUploader from './file-uploader';
import { ProjectAiPanel } from './project-ai-panel';
import { HkDistrictList } from './hk-district-list';
import { HkDistrictMap } from './hk-district-map';
import { MapOrList } from './map-or-list';
import { Professional } from '@/lib/types';
import { API_BASE_URL } from '@/config/api';
import { resolveMediaAssetUrl } from '@/lib/media-assets';
import { areaCodeToCanonicalLocation, deriveProjectAreaCodeFromLocation } from '@/lib/hk-districts';

export interface ProjectFormData {
  projectName: string;
  clientName: string;
  region: string;
  projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
  budget?: string | number;
  notes: string;
  selectedService?: string;
  location?: CanonicalLocation;
  photoUrls?: string[];
  existingPhotos?: Array<{ id?: string; url: string; note?: string | null }>;
  tradesRequired: string[];
  isEmergency?: boolean;
  onlySelectedProfessionalsCanBid?: boolean;
  endDate?: string; // ISO date string (YYYY-MM-DD)
  siteInspectionAvailableOn?: string; // ISO date string (YYYY-MM-DD)
  requiresSurveyService?: boolean;
  requiresDesignService?: boolean;
  aiFrom?: {
    assumptions?: string[];
    risks?: string[];
    safety?: {
      riskLevel?: string;
      isDangerous?: boolean;
      concerns?: string[];
      temporaryMitigations?: string[];
      shouldEscalateEmergency?: boolean;
      requiresImmediateHumanContact?: boolean;
      emergencyReason?: string | null;
      disclaimer?: string | null;
      adminReview?: {
        status?: string;
        acknowledgedAt?: string | null;
        acknowledgedByName?: string | null;
      } | null;
    } | null;
  };
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
  
  /** Form submission handler - receives form data, pending files, and removed photo URLs/ids */
  onSubmit: (data: ProjectFormData, pendingFiles: File[], removedPhotos: string[]) => Promise<void>;
  onAssistRequest?: (data: ProjectFormData, pendingFiles: File[], removedPhotos: string[]) => Promise<void>;
  
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

  /** Whether to show client name input */
  showClientName?: boolean;

  /** Show AI-first overview block before full editable fields */
  showAiOverview?: boolean;

  /** Render as confirmation-first screen when AI context exists */
  confirmationMode?: boolean;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type AvailableTrade = {
  id: string;
  name: string;
  category: string;
  professionType?: string | null;
  aliases?: string[];
};

const inferEmergencyFromSafety = (initialData?: Partial<ProjectFormData>) => {
  const safety = initialData?.aiFrom?.safety;
  if (!safety) return false;

  const riskLevel = (safety.riskLevel || '').toLowerCase();
  return Boolean(
    safety.isDangerous ||
    safety.shouldEscalateEmergency ||
    safety.requiresImmediateHumanContact ||
    riskLevel === 'high' ||
    riskLevel === 'critical',
  );
};

const buildInitialFormState = (initialData?: Partial<ProjectFormData>): ProjectFormData => ({
  projectName: initialData?.projectName || '',
  clientName: initialData?.clientName || '',
  region: initialData?.region || '',
  projectScale: initialData?.projectScale,
  budget: initialData?.budget || '',
  notes: initialData?.notes || '',
  selectedService: initialData?.selectedService || '',
  location: initialData?.location || {},
  photoUrls: initialData?.photoUrls || [],
  existingPhotos: (() => {
    const seededPhotos = (initialData?.existingPhotos || []).filter(
      (photo): photo is { id?: string; url: string; note?: string | null } =>
        typeof photo?.url === 'string' && photo.url.trim().length > 0,
    );

    if (seededPhotos.length > 0) {
      return seededPhotos;
    }

    return (initialData?.photoUrls || [])
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map((url) => ({ url }));
  })(),
  tradesRequired: initialData?.tradesRequired || [],
  isEmergency: initialData?.isEmergency ?? inferEmergencyFromSafety(initialData),
  onlySelectedProfessionalsCanBid: initialData?.onlySelectedProfessionalsCanBid ?? true,
  endDate: initialData?.endDate || '',
  siteInspectionAvailableOn: initialData?.siteInspectionAvailableOn || '',
  aiFrom: initialData?.aiFrom,
});

const normalizeTradeSelections = (trades: string[], availableTrades: AvailableTrade[]) => {
  const normalizedSelections: string[] = [];

  for (const trade of trades) {
    const rawValue = typeof trade === 'string' ? trade.trim() : '';
    if (!rawValue) continue;

    const normalizedValue = rawValue.toLowerCase();
    const matchedTrade = availableTrades.find((availableTrade) => {
      const aliases = availableTrade.aliases?.map((alias) => alias.toLowerCase()) ?? [];
      const tradeName = availableTrade.name.toLowerCase();
      const professionType = availableTrade.professionType?.toLowerCase();

      return (
        tradeName === normalizedValue ||
        professionType === normalizedValue ||
        aliases.includes(normalizedValue) ||
        tradeName.includes(normalizedValue) ||
        normalizedValue.includes(tradeName) ||
        (!!professionType && professionType.includes(normalizedValue)) ||
        aliases.some((alias) => alias.includes(normalizedValue) || normalizedValue.includes(alias))
      );
    });

    const resolvedTrade = matchedTrade?.name || rawValue;
    if (!normalizedSelections.includes(resolvedTrade)) {
      normalizedSelections.push(resolvedTrade);
    }
  }

  return normalizedSelections;
};

const tradeSelectionsMatch = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

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
  showClientName = true,
  showAiOverview = false,
  confirmationMode = false,
}: ProjectFormProps) {
    const t = useTranslations('project');
    const commonT = useTranslations('common');
  const initialDataKey = useMemo(() => JSON.stringify(initialData ?? {}), [initialData]);
  const [formData, setFormData] = useState<ProjectFormData>(() => buildInitialFormState(initialData));

  const [availableTrades, setAvailableTrades] = useState<AvailableTrade[]>([]);
  const [showTradeDropdown, setShowTradeDropdown] = useState(false);
  const [tradeSearchTerm, setTradeSearchTerm] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<Array<{ id?: string; url: string; note?: string | null }>>(() => buildInitialFormState(initialData).existingPhotos ?? []);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [showAiExtract, setShowAiExtract] = useState(() => {
    const riskLevel = (initialData?.aiFrom?.safety?.riskLevel || '').toLowerCase();
    return riskLevel === 'medium' || riskLevel === 'high' || riskLevel === 'critical';
  });
  const isReadOnly = mode === 'view';
  const usesDarkCreateSurface = mode === 'create' && !confirmationMode;
  const solidGreenButtonClassName = 'rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50';
  const solidBlueButtonClassName = 'rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50';
  const solidCrimsonButtonClassName = 'rounded-lg bg-rose-700 px-6 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50';

  useEffect(() => {
    const nextFormState = buildInitialFormState(initialData);
    setFormData(nextFormState);
    setExistingPhotos(nextFormState.existingPhotos || []);
    setPendingFiles([]);
    setRemovedPhotos([]);
    setTradeSearchTerm('');
    setShowTradeDropdown(false);
    const riskLevel = (initialData?.aiFrom?.safety?.riskLevel || '').toLowerCase();
    setShowAiExtract(riskLevel === 'medium' || riskLevel === 'high' || riskLevel === 'critical');
  }, [initialDataKey]);

  // Fetch available trades from API
  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/trades`);
        if (res.ok) {
          const data = await res.json();
          setAvailableTrades(data.map((t: AvailableTrade) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            professionType: t.professionType,
            aliases: t.aliases || [],
          })));
        }
      } catch (err) {
        console.warn('[ProjectForm] Failed to fetch trades:', err);
      }
    };
    fetchTrades();
  }, []);

  useEffect(() => {
    if (availableTrades.length === 0) return;

    setFormData((prev) => {
      const normalizedTrades = normalizeTradeSelections(prev.tradesRequired, availableTrades);
      if (tradeSelectionsMatch(prev.tradesRequired, normalizedTrades)) {
        return prev;
      }

      return {
        ...prev,
        tradesRequired: normalizedTrades,
      };
    });
  }, [availableTrades]);

  const isMobileUploaderDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|Mobile/i.test(ua);
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

  const hasSelectedProfessionals = displayNames.length > 0;

  const handleChange = (field: keyof ProjectFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLocationChange = (loc: CanonicalLocation) => {
    setFormData((prev) => ({ ...prev, location: loc }));
  };

  const handleFilesChange = (files: File[]) => {
    // Replace pendingFiles with the new array from FileUploader
    setPendingFiles(files);
  };

  const pendingFilePreviews = useMemo(
    () =>
      pendingFiles.map((file, index) => ({
        key: `${file.name}-${file.lastModified}-${index}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    [pendingFiles],
  );

  useEffect(() => {
    return () => {
      pendingFilePreviews.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [pendingFilePreviews]);

  const handleWizardStyleFilesChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    setPendingFiles((prev) => {
      const dedupe = new Set(prev.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const next = [...prev];
      for (const file of incoming) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!dedupe.has(key)) {
          dedupe.add(key);
          next.push(file);
        }
      }
      return next;
    });
  };

  const removePendingFile = (target: File) => {
    setPendingFiles((prev) =>
      prev.filter(
        (file) =>
          !(
            file.name === target.name &&
            file.size === target.size &&
            file.lastModified === target.lastModified
          ),
      ),
    );
  };

  const handleRemoveExistingPhoto = (urlOrId: string) => {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== urlOrId && p.url !== urlOrId));
    setRemovedPhotos((prev) => (prev.includes(urlOrId) ? prev : [...prev, urlOrId]));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ ...formData, existingPhotos }, pendingFiles, removedPhotos);
  };

  const handleAssistClick = async () => {
    if (typeof window !== 'undefined') {
      const initialMessage = [
        formData.projectName?.trim() ? `Project: ${formData.projectName.trim()}` : '',
        formData.notes?.trim() ? `Summary: ${formData.notes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      window.dispatchEvent(
        new CustomEvent('foh-open-chat', {
          detail: {
            context: 'project_creation',
            projectName: formData.projectName,
            initialMessage,
          },
        }),
      );
      return;
    }

    if (!onAssistRequest) return;
    await onAssistRequest({ ...formData, existingPhotos }, pendingFiles, removedPhotos);
  };

  const locationSummary = [
    formData.location?.tertiary,
    formData.location?.secondary,
    formData.location?.primary,
  ]
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(', ');
  const selectedProjectAreaCode = useMemo(
    () => deriveProjectAreaCodeFromLocation(formData.location),
    [formData.location?.primary, formData.location?.secondary, formData.location?.tertiary],
  );

  const handleProjectMapSelection = (codes: string[]) => {
    const nextCode = codes[0];
    handleLocationChange((nextCode ? areaCodeToCanonicalLocation(nextCode) : {}) as CanonicalLocation);
  };

  const hasAiContext = Boolean(
    showAiOverview &&
      (confirmationMode ||
        formData.aiFrom ||
        formData.projectName?.trim() ||
        formData.notes?.trim() ||
        formData.tradesRequired.length > 0),
  );

  const isConfirmationView = confirmationMode && hasAiContext;

  const showEditableAiFields = !hasAiContext || !confirmationMode;
  const shouldRequirePrimaryFields = !isReadOnly && showEditableAiFields;

  const formatDateForSummary = (value?: string) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-HK', { year: 'numeric', month: 'short', day: 'numeric' });
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
          <MapOrList
            storageKey="fh-map-or-list-preference"
            label="Project location input mode"
            helperText="Use the district map for a direct visual pick, or switch to the text list/dropdowns."
            mapLabel="Map"
            listLabel="Words"
            listPanelClassName="max-h-[45vh] overflow-y-auto pr-1"
            map={
              <HkDistrictMap
                selectionMode="single"
                selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                onChange={handleProjectMapSelection}
                disabled={isReadOnly || isSubmitting}
              />
            }
            list={
              <div className="space-y-3">
                <HkDistrictList
                  selectionMode="single"
                  selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                  onChange={handleProjectMapSelection}
                  disabled={isReadOnly || isSubmitting}
                />
                <LocationSelect
                  value={formData.location || {}}
                  onChange={handleLocationChange}
                  disabled={isReadOnly || isSubmitting}
                />
              </div>
            }
          />
          {locationSummary ? <p className="text-xs text-slate-500">Selected: {locationSummary}</p> : null}
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
          <label className="text-sm font-medium text-slate-800">Photos (optional but recommended)</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onFilesChange={handleFilesChange}
            showUploadAction={false}
            darkMode={usesDarkCreateSurface}
          />
          {pendingFiles.length > 0 && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
              📁 {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready to upload (will be uploaded when you click Create)
            </div>
          )}
          {existingPhotos.length > 0 && (
            <div className="mt-3 space-y-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">Existing photos</div>
              <div className="flex flex-wrap gap-2">
                {existingPhotos.map((photo) => (
                  <div
                    key={photo.id || photo.url}
                    className="relative h-16 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                  >
                    <img src={resolveMediaAssetUrl(photo.url)} alt="Project photo" className="h-full w-full object-cover" />
                    {!isReadOnly && (
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white"
                        onClick={() => handleRemoveExistingPhoto(photo.id || photo.url)}
                        aria-label="Remove photo"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Assistance Explanation */}
        {onAssistRequest && !isReadOnly && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-blue-900">💡 Need help?</p>
              <button
                type="button"
                onClick={handleAssistClick}
                disabled={isSubmitting}
                className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                Ask for advice
              </button>
            </div>
            <p className="text-xs text-blue-800">
              Get advice or let us manage the whole project — your choice. Open your project and click the chat bubble on the right to start a project-specific chat, WhatsApp, or book a call with us.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div
          className={`grid gap-3 pt-2 ${
            onCancel ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting || isReadOnly}
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {!isReadOnly && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isSubmitting ? `${submitLabel || 'Creating'}${pendingFiles.length > 0 ? ' & uploading' : ''}...` : submitLabel || 'Create Project'}
            </button>
          )}
        </div>
      </form>
    );
  }

  // Full project creation/edit form
  return (
    <form
      onSubmit={handleFormSubmit}
      className={usesDarkCreateSurface ? 'space-y-6 px-6 py-6 text-white sm:px-8 sm:py-8' : 'space-y-6'}
    >
      {/* Professional List (if applicable) */}
      {displayNames.length > 0 && !confirmationMode && (
        <div className={`rounded-md border p-3 ${
          usesDarkCreateSurface
            ? 'border-slate-700/40 bg-white/5 text-white'
            : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          <p className={`text-xs font-semibold ${
            usesDarkCreateSurface ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Professional{displayNames.length !== 1 ? 's' : ''} ({displayNames.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {displayNames.map((name, idx) => (
              <span
                key={`${name}-${idx}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  usesDarkCreateSurface
                    ? 'bg-emerald-500/30 text-emerald-200'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasAiContext && (
        <div className={`rounded-lg border p-4 space-y-3 ${
          usesDarkCreateSurface
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'mimo-panel'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
                usesDarkCreateSurface ? 'text-emerald-300' : 'text-emerald-700'
              }`}>Project Overview</p>
              <h3 className={`text-base font-bold ${
                usesDarkCreateSurface ? 'text-white' : 'text-emerald-900'
              }`}>
                {formData.projectName?.trim() || 'Untitled project'}
              </h3>
            </div>
          </div>

          <div className={`space-y-2 text-sm ${
            usesDarkCreateSurface ? 'text-slate-200' : 'text-slate-700'
          }`}>
            {formData.projectName?.trim() && (
              <p>
                <span className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Project:</span> {formData.projectName}
              </p>
            )}
            {(locationSummary || formData.region?.trim()) && (
              <p>
                <span className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Location:</span> {locationSummary || formData.region}
              </p>
            )}
            {formData.tradesRequired.length > 0 && (
              <p>
                <span className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Trades:</span> {formData.tradesRequired.join(', ')}
              </p>
            )}
            {formData.notes?.trim() && (
              <div>
                <p className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Scope</p>
                <p className="mt-1 whitespace-pre-wrap">{formData.notes}</p>
              </div>
            )}
            {confirmationMode && (
              <p>
                <span className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Priority:</span>{' '}
                {formData.isEmergency ? 'Emergency project' : 'Standard priority'}
              </p>
            )}
            {confirmationMode && (
              <p>
                <span className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Site inspection:</span> {formatDateForSummary(formData.siteInspectionAvailableOn)}
              </p>
            )}
            {confirmationMode && (
              <p>
                <span className={`font-semibold ${
                  usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
                }`}>Completion target:</span> {formatDateForSummary(formData.endDate)}
              </p>
            )}
          </div>
        </div>
      )}

      {formData.aiFrom && (
        <div className={`rounded-lg border p-3 ${
          usesDarkCreateSurface
            ? 'border-violet-500/40 bg-violet-500/10'
            : 'mimo-panel'
        }`}>
          <button
            type="button"
            onClick={() => setShowAiExtract((prev) => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className={`text-sm font-semibold ${
              usesDarkCreateSurface ? 'text-violet-300' : 'text-violet-900'
            }`}>Safety, Assumptions and Risks</span>
            <span className={`text-xs font-semibold ${
              usesDarkCreateSurface ? 'text-violet-300' : 'text-violet-700'
            }`}>{showAiExtract ? 'Hide' : 'Show'}</span>
          </button>
          {showAiExtract && (
            <ProjectAiPanel
              aiIntake={{
                assumptions: formData.aiFrom.assumptions,
                risks: formData.aiFrom.risks,
                safetyAssessment: formData.aiFrom.safety,
              }}
              mode="client"
              className={`mt-3 ${
                usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
              }`}
            />
          )}
        </div>
      )}

      {/* Project Name */}
      <div className={showEditableAiFields ? '' : 'hidden'}>
        <label className={`block text-sm font-semibold mb-2 ${
          usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
        }`}>
          Project Name {!isReadOnly && '*'}
        </label>
        <input
          type="text"
          required={shouldRequirePrimaryFields}
          placeholder="e.g., Office Fitout, Restaurant Renovation"
          value={formData.projectName}
          onChange={(e) => handleChange('projectName', e.target.value)}
          disabled={isReadOnly || isSubmitting}
          className={`w-full rounded-lg border px-4 py-2.5 text-base focus:outline-none focus:ring-1 ${
            usesDarkCreateSurface
              ? 'border-slate-600 bg-slate-800/50 text-white placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400 disabled:bg-slate-700 disabled:text-slate-500'
              : 'border-slate-300 text-base disabled:bg-slate-50 disabled:text-slate-600 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
      </div>

      {/* Client Name */}
      {showClientName && (
        <div>
          <label className={`block text-sm font-semibold mb-2 ${
            usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
          }`}>
            Your Name
          </label>
          <input
            type="text"
            placeholder="Your full name"
            value={formData.clientName}
            onChange={(e) => handleChange('clientName', e.target.value)}
            disabled={isReadOnly || isSubmitting}
            className={`w-full rounded-lg border px-4 py-2.5 text-base focus:outline-none focus:ring-1 ${
              usesDarkCreateSurface
                ? 'border-slate-600 bg-slate-800/50 text-white placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400 disabled:bg-slate-700 disabled:text-slate-500'
                : 'border-slate-300 text-base disabled:bg-slate-50 disabled:text-slate-600 focus:border-blue-500 focus:ring-blue-500'
            }`}
          />
        </div>
      )}

      {/* Location */}
      <div className={showEditableAiFields ? '' : 'hidden'}>
        <label className={`block text-sm font-semibold mb-2 ${
          usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
        }`}>
          Region/Location {!isReadOnly && '*'}
        </label>
        <MapOrList
          storageKey="fh-map-or-list-preference"
          label="Project location input mode"
          helperText="Switch between the district map and the text list/dropdowns. Your preference is saved locally."
          mapLabel="Map"
          listLabel="Words"
          listPanelClassName="max-h-[45vh] overflow-y-auto pr-1"
          map={
            <HkDistrictMap
              selectionMode="single"
              selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
              onChange={handleProjectMapSelection}
              disabled={isReadOnly || isSubmitting}
            />
          }
          list={
            <div className="space-y-3">
              <HkDistrictList
                selectionMode="single"
                selectedAreaCodes={selectedProjectAreaCode ? [selectedProjectAreaCode] : []}
                onChange={handleProjectMapSelection}
                disabled={isReadOnly || isSubmitting}
              />
              <LocationSelect
                value={formData.location || {}}
                onChange={handleLocationChange}
                disabled={isReadOnly || isSubmitting}
              />
            </div>
          }
        />
        {locationSummary ? (
          <p className={`mt-2 text-xs ${usesDarkCreateSurface ? 'text-slate-300' : 'text-slate-500'}`}>
            Selected: {locationSummary}
          </p>
        ) : null}
      </div>

      {/* Trades Required */}
      {showService && (
        <div className={showEditableAiFields ? '' : 'hidden'}>
          <label className={`block text-sm font-semibold mb-2 ${
            usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
          }`}>
            Required Trades/Services {!isReadOnly && '*'}
          </label>
          <div className={`flex min-h-[46px] flex-wrap gap-2 rounded-lg border px-4 py-2.5 ${
            usesDarkCreateSurface
              ? 'border-slate-600 bg-white/5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400'
              : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500'
          }`}>
            {formData.tradesRequired.map((trade, idx) => (
              <span
                key={`${trade}-${idx}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  usesDarkCreateSurface
                    ? 'bg-blue-500/20 text-blue-100'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {trade}
                <button
                  type="button"
                  onClick={() => handleChange('tradesRequired', formData.tradesRequired.filter((_, i) => i !== idx))}
                  disabled={isReadOnly || isSubmitting}
                  className={usesDarkCreateSurface ? 'hover:text-white disabled:opacity-50' : 'hover:text-blue-900 disabled:opacity-50'}
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
                required={shouldRequirePrimaryFields && formData.tradesRequired.length === 0}
                className={`w-full border-0 bg-transparent px-2 py-1 text-base outline-none ${
                  usesDarkCreateSurface
                    ? 'text-white placeholder-slate-400 disabled:text-slate-500'
                    : 'disabled:bg-slate-50'
                }`}
              />
              {showTradeDropdown && filteredTrades.length > 0 && !isReadOnly && !isSubmitting && (
                <div className={`absolute top-full left-0 z-10 mt-1 max-h-60 w-full min-w-[250px] overflow-y-auto rounded-md border shadow-lg ${
                  usesDarkCreateSurface
                    ? 'border-slate-700 bg-slate-900/95 shadow-slate-950/50 backdrop-blur'
                    : 'border-slate-200 bg-white'
                }`}>
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
                      className={`flex w-full items-center justify-between border-b px-3 py-2.5 text-left last:border-0 ${
                        usesDarkCreateSurface
                          ? 'border-slate-800 hover:bg-blue-500/10'
                          : 'border-slate-100 hover:bg-blue-50'
                      }`}
                    >
                      <span className={usesDarkCreateSurface ? 'font-medium text-white' : 'font-medium text-slate-900'}>{trade.name}</span>
                      <span className={`text-xs uppercase tracking-wide ${
                        usesDarkCreateSurface ? 'text-slate-400' : 'text-slate-500'
                      }`}>{trade.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className={`mt-1 text-xs ${usesDarkCreateSurface ? 'text-slate-400' : 'text-slate-500'}`}>
            Select from available trades. Type to search, click to add.
          </p>
        </div>
      )}

      {/* Budget */}
      {showBudget && (
        <div>
          <label className={`block text-sm font-semibold mb-2 ${
            usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
          }`}>
            Budget (HKD) <span className={`font-normal ${
              usesDarkCreateSurface ? 'text-slate-300' : 'text-slate-500'
            }`}>(Optional)</span>
          </label>
          <div className="relative">
            <span className={`absolute left-4 top-3 font-medium ${
              usesDarkCreateSurface ? 'text-slate-400' : 'text-slate-500'
            }`}>$</span>
            <input
              type="number"
              placeholder="100,000"
              value={formData.budget || ''}
              onChange={(e) => handleChange('budget', e.target.value)}
              disabled={isReadOnly || isSubmitting}
              min="0"
              step="1000"
              className={`w-full rounded-lg border px-4 py-2.5 pl-8 text-base focus:outline-none focus:ring-1 ${
              usesDarkCreateSurface
                ? 'border-slate-600 bg-slate-800/50 text-white placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400 disabled:bg-slate-700 disabled:text-slate-500'
                : 'border-slate-300 disabled:bg-slate-50 focus:border-blue-500 focus:ring-blue-500'
            }`}
            />
          </div>
        </div>
      )}

      {/* Project Scope & Notes */}
      <div className={showEditableAiFields ? '' : 'hidden'}>
        <label className={`block text-sm font-semibold mb-2 ${
          usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
        }`}>
          Project Scope & Details <span className={`font-normal ${
            usesDarkCreateSurface ? 'text-slate-300' : 'text-slate-500'
          }`}>(Optional)</span>
        </label>
        <textarea
          placeholder="Describe your project scope, requirements, timeline, and any specific needs. This helps professionals understand your project better."
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          disabled={isReadOnly || isSubmitting}
          rows={6}
          className={`w-full rounded-lg border px-4 py-2.5 text-base focus:outline-none focus:ring-1 resize-none ${
            usesDarkCreateSurface
              ? 'border-slate-600 bg-slate-800/50 text-white placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400 disabled:bg-slate-700 disabled:text-slate-500'
              : 'border-slate-300 disabled:bg-slate-50 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        <p className={`text-xs mt-1 ${
          usesDarkCreateSurface ? 'text-slate-400' : 'text-slate-500'
        }`}>You can add photos and more details after creating the project.</p>
      </div>

      {/* Timescale */}
      {!isConfirmationView && (
      <div className={usesDarkCreateSurface ? '' : 'mimo-panel p-4'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                id="isEmergency"
                type="checkbox"
                checked={!!formData.isEmergency}
                onChange={(e) => handleChange('isEmergency', e.target.checked)}
                disabled={isReadOnly || isSubmitting}
                className={`h-4 w-4 rounded ${
                  usesDarkCreateSurface ? 'border-slate-600 accent-blue-400' : 'border-slate-300'
                }`}
              />
              <label htmlFor="isEmergency" className={`text-sm font-medium ${
                usesDarkCreateSurface ? 'text-white' : 'text-slate-800'
              }`}>This is an emergency</label>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="onlySelectedProfessionalsCanBid"
                type="checkbox"
                checked={formData.onlySelectedProfessionalsCanBid ?? true}
                onChange={(e) => handleChange('onlySelectedProfessionalsCanBid', e.target.checked)}
                disabled={isReadOnly || isSubmitting}
                className={`mt-0.5 h-4 w-4 rounded ${
                  usesDarkCreateSurface ? 'border-slate-600 accent-blue-400' : 'border-slate-300'
                }`}
              />
              <label htmlFor="onlySelectedProfessionalsCanBid" className={`text-sm font-medium ${
                usesDarkCreateSurface ? 'text-white' : 'text-slate-800'
              }`}>
                Only allow professionals that I select to bid on this project
              </label>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className={`text-sm font-medium ${
                usesDarkCreateSurface ? 'text-white' : 'text-slate-800'
              }`}>
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  I need this completed by
                </span>
              </label>
              <input
                type="date"
                value={formData.endDate || ''}
                onChange={(e) => handleChange('endDate', e.target.value)}
                disabled={isReadOnly || isSubmitting}
                className={`rounded-md border px-3 py-2 text-sm ${
                  usesDarkCreateSurface
                    ? 'border-slate-600 bg-slate-800/50 text-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert'
                    : 'border-[rgba(120,53,15,0.16)] bg-[rgba(245,238,222,0.9)] text-slate-900 focus:border-[rgba(185,78,45,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(185,78,45,0.3)]'
                }`}
              />
            </div>
            <div className="grid gap-1">
              <label className={`text-sm font-medium ${
                usesDarkCreateSurface ? 'text-white' : 'text-slate-800'
              }`}>
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  I can allow site inspection on
                </span>
              </label>
              <input
                type="date"
                value={formData.siteInspectionAvailableOn || ''}
                onChange={(e) => handleChange('siteInspectionAvailableOn', e.target.value)}
                disabled={isReadOnly || isSubmitting}
                className={`rounded-md border px-3 py-2 text-sm ${
                  usesDarkCreateSurface
                    ? 'border-slate-600 bg-slate-800/50 text-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert'
                    : 'border-[rgba(120,53,15,0.16)] bg-[rgba(245,238,222,0.9)] text-slate-900 focus:border-[rgba(185,78,45,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(185,78,45,0.3)]'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* File Upload */}
      {!isReadOnly && (
        <div className={usesDarkCreateSurface ? '' : 'mimo-panel p-4'}>
          <label className={`block text-sm font-semibold mb-2 ${
            usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
          }`}>
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Photos (optional)
            </span>
          </label>
          {isConfirmationView ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-3 py-3 text-base font-semibold text-white hover:bg-emerald-700">
                  Upload images, documents or photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleWizardStyleFilesChange(e.target.files)}
                    disabled={isSubmitting}
                  />
                </label>

                {isMobileUploaderDevice && (
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50">
                    Take photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleWizardStyleFilesChange(e.target.files)}
                      disabled={isSubmitting}
                    />
                  </label>
                )}
              </div>

              {pendingFilePreviews.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed text-slate-700">New images selected ({pendingFilePreviews.length})</p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {pendingFilePreviews.map(({ key, file, previewUrl }) => (
                      <div key={key} className="min-w-32 rounded-lg border border-slate-200 bg-white p-2">
                        <div className="relative h-24 overflow-hidden rounded">
                          <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePendingFile(file)}
                          className="mt-2 w-full rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingFilePreviews.length > 0 && (
                <div className={`rounded-md border px-3 py-2 text-xs ${
                  usesDarkCreateSurface
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  {pendingFilePreviews.length} new file{pendingFilePreviews.length !== 1 ? 's' : ''} ready to upload on submit
                </div>
              )}
            </div>
          ) : (
            <>
              <FileUploader
                maxFiles={MAX_FILES}
                maxFileSize={MAX_FILE_SIZE}
                onFilesChange={handleFilesChange}
                showUploadAction={false}
                darkMode={usesDarkCreateSurface}
              />
              {pendingFiles.length > 0 && (
                <div className={`rounded-md border px-3 py-2 text-xs mt-2 ${
                  usesDarkCreateSurface
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  📁 {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready to upload (will be uploaded when you click Create)
                </div>
              )}
            </>
          )}
          {existingPhotos.length > 0 && (
            <div className={`mt-3 space-y-2 text-xs ${
              usesDarkCreateSurface ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <div className={`font-semibold ${
                usesDarkCreateSurface ? 'text-white' : 'text-slate-900'
              }`}>Existing photos</div>
              <div className="flex flex-wrap gap-2">
                {existingPhotos.map((photo) => {
                  // Keep existing photo styling consistent
                  return (
                    <div
                      key={photo.id || photo.url}
                      className="relative h-20 w-24 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                    >
                      <img src={resolveMediaAssetUrl(photo.url)} alt="Project photo" className="h-full w-full object-cover" />
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white"
                          onClick={() => handleRemoveExistingPhoto(photo.id || photo.url)}
                          aria-label="Remove photo"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`rounded-lg border p-4 text-sm ${
          usesDarkCreateSurface
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : 'mimo-panel text-red-700'
        }`}>
          {error}
        </div>
      )}

      {/* Assistance Explanation */}
      {onAssistRequest && !isReadOnly && (
        <div className={`rounded-lg border px-4 py-3 ${
          usesDarkCreateSurface
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-100'
            : 'mimo-panel'
        }`}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className={`text-sm font-semibold ${usesDarkCreateSurface ? 'text-white' : 'text-blue-900'}`}>
              💡 Need help?
            </p>
            <button
              type="button"
              onClick={handleAssistClick}
              disabled={isSubmitting}
              className={`shrink-0 ${solidBlueButtonClassName}`}
            >
              Ask for advice
            </button>
          </div>
          <p className={`text-sm ${usesDarkCreateSurface ? 'text-blue-100' : 'text-blue-800'}`}>
            Get advice or let us manage the whole project — your choice. Open your project and click the chat bubble on the right to start a project-specific chat, WhatsApp, or book a call with us.
          </p>

          <div className={`mt-4 grid gap-3 ${onCancel ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting || isReadOnly}
                className={`w-full ${solidCrimsonButtonClassName}`}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full ${solidGreenButtonClassName}`}
            >
              {isSubmitting ? `${submitLabel || 'Creating Project'}${pendingFiles.length > 0 ? ' & uploading' : ''}...` : submitLabel || 'Create Project'}
            </button>
          </div>
        </div>
      )}

      {/* Buttons */}
      {(!onAssistRequest || isReadOnly) && (
        <div
          className={`grid gap-3 pt-4 ${
            onCancel ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting || isReadOnly}
              className={`w-full ${solidCrimsonButtonClassName}`}
            >
              Cancel
            </button>
          )}
          {!isReadOnly && (
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full ${solidGreenButtonClassName}`}
            >
              {isSubmitting ? `${submitLabel || 'Creating Project'}${pendingFiles.length > 0 ? ' & uploading' : ''}...` : submitLabel || 'Create Project'}
            </button>
          )}
        </div>
      )}

    </form>
  );
}


