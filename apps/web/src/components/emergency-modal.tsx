'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ChatImageUploader from '@/components/chat-image-uploader';
import LocationSelect, { CanonicalLocation } from '@/components/location-select';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { getUploadResponseKeys } from '@/lib/media-assets';
import { storeEmergencyPhotoUrls } from '@/lib/emergency-photos';

let cachedEmergencyTrades: string[] | null = null;
let cachedEmergencyTradesPromise: Promise<string[]> | null = null;

async function loadEmergencyTrades(): Promise<string[]> {
  if (cachedEmergencyTrades) return cachedEmergencyTrades;
  if (cachedEmergencyTradesPromise) return cachedEmergencyTradesPromise;

  cachedEmergencyTradesPromise = fetch(`${API_BASE_URL}/trades`)
    .then((r) => r.json())
    .then((data: Array<{ name?: string; title?: string; enabled?: boolean; sortOrder?: number }>) => {
      const names = (data || [])
        .filter((t) => t.enabled !== false)
        .sort((a, b) => {
          const diff = (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
          if (diff !== 0) return diff;
          return (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '');
        })
        .map((t) => t.name ?? t.title ?? '')
        .filter(Boolean);

      cachedEmergencyTrades = names;
      return names;
    })
    .finally(() => {
      cachedEmergencyTradesPromise = null;
    });

  return cachedEmergencyTradesPromise;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}
export function EmergencyModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const { accessToken, userLocation } = useAuth();
  const [selectedTrade, setSelectedTrade] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<CanonicalLocation>({});
  const [description, setDescription] = useState('');
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);
  const [trades, setTrades] = useState<string[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isBusinessHours = useMemo(() => {
    const hours = new Date().getHours();
    return hours >= 7 && hours < 20;
  }, []);

  const uploadEmergencyPhotos = async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await fetch(`${API_BASE_URL}/uploads`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as { message?: string })?.message || `Image upload failed (${response.status})`);
    }

    const uploadedUrls = getUploadResponseKeys(payload as any);
    if (uploadedUrls.length === 0) {
      throw new Error('Image upload failed: invalid response');
    }

    return uploadedUrls;
  };

  useEffect(() => {
    if (!isOpen) return;
    if (cachedEmergencyTrades) {
      setTrades(cachedEmergencyTrades);
      return;
    }

    setTradesLoading(true);
    loadEmergencyTrades()
      .then((names) => {
        setTrades(names);
      })
      .catch(() => {})
      .finally(() => setTradesLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedLocation.primary) return;
    if (!userLocation?.primary && !userLocation?.secondary && !userLocation?.tertiary) return;

    setSelectedLocation({
      primary: userLocation.primary,
      secondary: userLocation.secondary,
      tertiary: userLocation.tertiary,
    });
  }, [isOpen, selectedLocation.primary, userLocation]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTrade('');
      setSelectedLocation({});
      setDescription('');
      setPendingPhotoFiles([]);
      setShowPhotoPrompt(false);
      setUploadingPhotos(false);
      setUploadError(null);
    }
  }, [isOpen]);
  const hasLocation = Boolean(selectedLocation.primary);
  const proceedToProfessionals = async () => {
    if (!selectedTrade || !hasLocation) return;
    setUploadError(null);

    let photoToken: string | null = null;
    if (pendingPhotoFiles.length > 0) {
      try {
        setUploadingPhotos(true);
        const uploadedUrls = await uploadEmergencyPhotos(pendingPhotoFiles);
        photoToken = storeEmergencyPhotoUrls(uploadedUrls);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Failed to upload images');
        setUploadingPhotos(false);
        return;
      } finally {
        setUploadingPhotos(false);
      }
    }

    const locationParts = [selectedLocation.primary]
      .filter(Boolean)
      .join(', ');
    const params = new URLSearchParams({
      source: 'emergency',
      trade: selectedTrade,
      location: locationParts,
      emergencyOnly: isBusinessHours ? 'false' : 'true',
    });
    if (description.trim()) params.set('notes', description.trim());
    if (photoToken) params.set('photoKey', photoToken);
    router.push('/professionals?' + params.toString());
    onClose();
  };

  const handleGetHelp = async () => {
    if (!selectedTrade || !hasLocation) return;
    if (pendingPhotoFiles.length === 0) {
      setShowPhotoPrompt(true);
      return;
    }
    await proceedToProfessionals();
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-20">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative mx-4 w-full max-w-md max-h-full overflow-y-auto rounded-2xl border border-white/45 bg-[#F5EEDE]/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {showPhotoPrompt && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/55 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/55 bg-[#FCF8EE] p-5 shadow-2xl">
              <h3 className="text-base font-bold text-slate-900">Add photos before sending?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Pictures really help professionals understand the emergency, arrive with the right equipment, and price the job more accurately.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPhotoPrompt(false)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Add photos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoPrompt(false);
                    void proceedToProfessionals();
                  }}
                  className="flex-1 rounded-lg bg-[#F97362] px-4 py-2 text-sm font-semibold text-[#FCF8EE] hover:bg-[#e8624f] transition"
                >
                  Continue without photos
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="mb-5 text-center">
          <p className="text-3xl mb-1">&#x1F6A8;</p>
          <h2 className="text-lg font-bold text-slate-900">Emergency help needed</h2>
          {!isBusinessHours && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              <span className="font-semibold">Off-hours mode</span> ? showing only emergency-available professionals
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Briefly describe the problem</label>
            <textarea
              rows={3}
              placeholder="e.g. Burst pipe under the kitchen sink, water everywhere..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#F97362]/40"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Trade needed</label>
            <select
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              disabled={tradesLoading}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-60"
            >
              <option value="">{tradesLoading ? 'Loading trades...' : 'Select a trade...'}</option>
              {trades.map((trade) => (
                <option key={trade} value={trade}>{trade}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Your location</label>
            <LocationSelect
              value={selectedLocation}
              onChange={setSelectedLocation}
              labels={{ primary: 'Region' }}
              maxLevel={1}
              className="grid gap-2"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Pictures of the problem</label>
            <ChatImageUploader
              onFilesSelected={(files) => {
                setPendingPhotoFiles(files);
                setUploadError(null);
              }}
              disabled={uploadingPhotos}
              isUploading={uploadingPhotos && pendingPhotoFiles.length > 0}
              uploadingCount={pendingPhotoFiles.length}
            />
            {uploadError && <p className="text-xs text-rose-700">{uploadError}</p>}
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGetHelp}
            disabled={!selectedTrade || !hasLocation || uploadingPhotos}
            className="flex-1 rounded-lg bg-[#F97362] px-4 py-2 text-sm font-semibold text-[#FCF8EE] hover:bg-[#e8624f] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingPhotos ? 'Uploading photos...' : 'Find help now'}
          </button>
        </div>
      </div>
    </div>
  );
}

