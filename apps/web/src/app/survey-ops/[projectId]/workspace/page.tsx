'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useRoleGuard } from '@/hooks/use-role-guard';
import ChatImageUploader from '@/components/chat-image-uploader';
import { getUploadResponseKeys, resolveMediaAssetUrl } from '@/lib/media-assets';

const ALLOWED_ROLES = ['admin', 'surveyor', 'mimo_boh'] as const;

type MarkupPoint = {
  x: number;
  y: number;
  note?: string;
  color?: string;
};

type WorkspacePhoto = {
  storageKey?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
  markup?: {
    points?: MarkupPoint[];
  };
};

type WorkspaceRoom = {
  id: string;
  room: string;
  scanUrl: string;
  summary: string;
  accessNotes: string;
  recommendations: string;
  photos: WorkspacePhoto[];
};

type WorkspaceReport = {
  id: string | null;
  status: string;
  title: string;
  summary: string;
  accessNotes: string;
  recommendations: string;
  rooms: WorkspaceRoom[];
  photos: WorkspacePhoto[];
  submittedAt: string | null;
  updatedAt: string | null;
};

const createEmptyRoom = (index: number, photos: WorkspacePhoto[] = []): WorkspaceRoom => ({
  id: `room_${index + 1}`,
  room: index === 0 ? 'Room' : `Room ${index + 1}`,
  scanUrl: '',
  summary: '',
  accessNotes: '',
  recommendations: '',
  photos,
});

const normalizeRooms = (rooms: unknown, fallbackPhotos: WorkspacePhoto[], fallbackCount: number): WorkspaceRoom[] => {
  const cleanRooms = Array.isArray(rooms)
    ? rooms.slice(0, 25).map((room, index) => {
        const candidate = room as Partial<WorkspaceRoom> | null | undefined;
        return {
          id: String(candidate?.id || `room_${index + 1}`),
          room: String(candidate?.room || `Room ${index + 1}`).trim() || `Room ${index + 1}`,
          scanUrl: String(candidate?.scanUrl || '').trim(),
          summary: String(candidate?.summary || '').trim(),
          accessNotes: String(candidate?.accessNotes || '').trim(),
          recommendations: String(candidate?.recommendations || '').trim(),
          photos: Array.isArray(candidate?.photos) ? candidate.photos.slice(0, 100) : [],
        };
      })
    : [];

  if (cleanRooms.length > 0) {
    return cleanRooms;
  }

  const count = Number.isFinite(fallbackCount) && fallbackCount > 0 ? Math.floor(fallbackCount) : 1;
  const safeCount = Math.max(count, 1);
  return Array.from({ length: safeCount }, (_, index) => createEmptyRoom(index, index === 0 ? fallbackPhotos : []));
};

const flattenRoomPhotos = (rooms: WorkspaceRoom[]) => rooms.flatMap((room) => room.photos || []);

const toNumber = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export default function SurveyWorkspacePage() {
  useRoleGuard([...ALLOWED_ROLES], { fallback: '/' });

  const { accessToken, user } = useAuth();
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const projectId = String(params?.projectId || '');
  const surveyExtraId = String(searchParams.get('surveyExtraId') || '');
  const roomCountParam = Number(searchParams.get('rooms') || '1');
  const initialRoomCount = Number.isFinite(roomCountParam) && roomCountParam > 0 ? Math.floor(roomCountParam) : 1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploaderClearKey, setUploaderClearKey] = useState(0);
  const [selectedRoomIndex, setSelectedRoomIndex] = useState(0);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [newPointColor, setNewPointColor] = useState('#ef4444');

  const [form, setForm] = useState<WorkspaceReport>({
    id: null,
    status: 'draft',
    title: '',
    summary: '',
    accessNotes: '',
    recommendations: '',
    rooms: [createEmptyRoom(0)],
    photos: [],
    submittedAt: null,
    updatedAt: null,
  });

  const activeRoom = form.rooms[selectedRoomIndex] || form.rooms[0] || null;
  const activePhoto = activeRoom?.photos?.[selectedPhotoIndex] || null;

  const loadWorkspace = useCallback(async () => {
    if (!accessToken || !projectId || !surveyExtraId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/workspace?surveyExtraId=${encodeURIComponent(surveyExtraId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to load survey workspace');
      }

      const report = (payload?.report || {}) as Partial<WorkspaceReport> & { rooms?: unknown };
      const nextRooms = normalizeRooms(report.rooms, Array.isArray(report.photos) ? report.photos : [], initialRoomCount);
      setForm({
        id: report.id || null,
        status: report.status || 'draft',
        title: report.title || '',
        summary: report.summary || '',
        accessNotes: report.accessNotes || '',
        recommendations: report.recommendations || '',
        rooms: nextRooms,
        photos: flattenRoomPhotos(nextRooms),
        submittedAt: report.submittedAt || null,
        updatedAt: report.updatedAt || null,
      });
      setSelectedRoomIndex(0);
      setSelectedPhotoIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load survey workspace');
    } finally {
      setLoading(false);
    }
  }, [accessToken, initialRoomCount, projectId, surveyExtraId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const saveDraft = useCallback(async () => {
    if (!accessToken || !projectId || !surveyExtraId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/workspace/draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          surveyExtraId,
          title: form.title,
          summary: form.summary,
          accessNotes: form.accessNotes,
          recommendations: form.recommendations,
          rooms: form.rooms,
          photos: form.photos,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to save survey draft');
      }

      const report = (payload?.report || {}) as WorkspaceReport;
      setForm((prev) => ({
        ...prev,
        id: report.id || prev.id,
        status: report.status || prev.status,
        rooms: Array.isArray(report.rooms) ? report.rooms : prev.rooms,
        updatedAt: report.updatedAt || prev.updatedAt,
      }));
      setSuccess('Draft saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save survey draft');
    } finally {
      setSaving(false);
    }
  }, [accessToken, form, projectId, surveyExtraId]);

  const saveDraftSnapshot = useCallback(
    async (snapshot: WorkspaceReport) => {
      if (!accessToken || !projectId || !surveyExtraId) return null;

      const response = await fetch(
        `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/workspace/draft`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            surveyExtraId,
            title: snapshot.title,
            summary: snapshot.summary,
            accessNotes: snapshot.accessNotes,
            recommendations: snapshot.recommendations,
            rooms: snapshot.rooms,
            photos: snapshot.photos,
          }),
        },
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to save survey draft');
      }

      return payload?.report as WorkspaceReport | undefined;
    },
    [accessToken, projectId, surveyExtraId],
  );

  const submitForApproval = useCallback(async () => {
    if (!accessToken || !projectId || !surveyExtraId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/workspace/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ surveyExtraId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to submit survey report');
      }

      setForm((prev) => ({
        ...prev,
        status: 'submitted_for_client_approval',
      }));
      setSuccess('Submitted for client approval');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit survey report');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, projectId, surveyExtraId]);

  const uploadImages = useCallback(async () => {
    if (pendingFiles.length === 0 || !activeRoom) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      pendingFiles.forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to upload images');
      }

      const urls = getUploadResponseKeys(payload);
      if (urls.length === 0) {
        throw new Error('Upload did not return image keys');
      }

      const photos: WorkspacePhoto[] = urls.map((url) => ({
        storageKey: String(url || '').trim(),
        imageUrl: String(url || '').trim(),
        caption: '',
        markup: { points: [] },
      }));

      const nextRooms = form.rooms.map((room, index) =>
        index === selectedRoomIndex
          ? {
              ...room,
              photos: [...(room.photos || []), ...photos],
            }
          : room,
      );
      const nextPhotos = flattenRoomPhotos(nextRooms);

      setForm((prev) => ({
        ...prev,
        rooms: nextRooms,
        photos: nextPhotos,
      }));
      setSelectedPhotoIndex((prev) => (nextRooms[selectedRoomIndex]?.photos?.length ? Math.max(prev, 0) : 0));

      const savedReport = await saveDraftSnapshot({
        ...form,
        rooms: nextRooms,
        photos: nextPhotos,
      });

      setForm((prev) => ({
        ...prev,
        id: savedReport?.id || prev.id,
        status: savedReport?.status || prev.status,
        updatedAt: savedReport?.updatedAt || prev.updatedAt,
        rooms: Array.isArray(savedReport?.rooms) ? savedReport.rooms : nextRooms,
        photos: Array.isArray(savedReport?.photos) ? savedReport.photos : nextPhotos,
      }));
      setPendingFiles([]);
      setUploaderClearKey((prev) => prev + 1);
      setSuccess('Images uploaded. Save draft to persist markup data.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setUploading(false);
    }
  }, [activeRoom, form, pendingFiles, saveDraftSnapshot, selectedRoomIndex]);

  const updateActivePhoto = (updater: (photo: WorkspacePhoto) => WorkspacePhoto) => {
    setForm((prev) => {
      const room = prev.rooms[selectedRoomIndex];
      const roomPhoto = room?.photos?.[selectedPhotoIndex];
      if (!room || !roomPhoto) return prev;

      const nextRooms = [...prev.rooms];
      const nextRoomPhotos = [...room.photos];
      nextRoomPhotos[selectedPhotoIndex] = updater(nextRoomPhotos[selectedPhotoIndex]);
      nextRooms[selectedRoomIndex] = {
        ...room,
        photos: nextRoomPhotos,
      };

      return {
        ...prev,
        rooms: nextRooms,
        photos: flattenRoomPhotos(nextRooms),
      };
    });
  };

  const updateActiveRoom = (updater: (room: WorkspaceRoom) => WorkspaceRoom) => {
    setForm((prev) => {
      const room = prev.rooms[selectedRoomIndex];
      if (!room) return prev;

      const nextRooms = [...prev.rooms];
      nextRooms[selectedRoomIndex] = updater(room);

      return {
        ...prev,
        rooms: nextRooms,
        photos: flattenRoomPhotos(nextRooms),
      };
    });
  };

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = toNumber(((event.clientX - rect.left) / rect.width) * 100);
    const y = toNumber(((event.clientY - rect.top) / rect.height) * 100);

    updateActivePhoto((photo) => ({
      ...photo,
      markup: {
        points: [
          ...(photo.markup?.points || []),
          {
            x,
            y,
            note: '',
            color: newPointColor,
          },
        ],
      },
    }));
  };

  const points = useMemo(() => activePhoto?.markup?.points || [], [activePhoto]);

  if (!surveyExtraId) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Missing surveyExtraId. Open this page from Survey Ops queue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-600">Survey Ops Workspace</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Start Survey</h1>
            <p className="mt-2 text-sm text-slate-600">
              Capture structured findings, annotate photos, and submit for client approval.
            </p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p>Signed in as {user?.email || 'User'}</p>
            <p className="mt-1">Status: <span className="font-semibold text-slate-900">{form.status}</span></p>
            <Link href="/survey-ops" className="mt-2 inline-block rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
              Back to queue
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading survey workspace...</div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Survey Notes</h2>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                  placeholder="Survey title"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Summary</label>
                <textarea
                  rows={4}
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                  placeholder="What was observed on site?"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Access Notes</label>
                <textarea
                  rows={3}
                  value={form.accessNotes}
                  onChange={(e) => setForm((prev) => ({ ...prev, accessNotes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Recommendations</label>
                <textarea
                  rows={4}
                  value={form.recommendations}
                  onChange={(e) => setForm((prev) => ({ ...prev, recommendations: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Room Pages</h2>
                  <p className="mt-1 text-xs text-slate-500">Each room gets its own page, scan link, and markup set.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => {
                      const nextRooms = [...prev.rooms, createEmptyRoom(prev.rooms.length)];
                      return {
                        ...prev,
                        rooms: nextRooms,
                        photos: flattenRoomPhotos(nextRooms),
                      };
                    });
                    setSelectedRoomIndex(form.rooms.length);
                    setSelectedPhotoIndex(0);
                  }}
                  className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                >
                  Add room page
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {form.rooms.map((room, index) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      setSelectedRoomIndex(index);
                      setSelectedPhotoIndex(0);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedRoomIndex === index ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {room.room || `Room ${index + 1}`}
                  </button>
                ))}
              </div>

              {activeRoom ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Room field</label>
                      <input
                        value={activeRoom.room}
                        onChange={(e) =>
                          updateActiveRoom((room) => ({
                            ...room,
                            room: e.target.value,
                          }))
                        }
                        placeholder="Room name"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">3D scan URL</label>
                      <input
                        value={activeRoom.scanUrl}
                        onChange={(e) =>
                          updateActiveRoom((room) => ({
                            ...room,
                            scanUrl: e.target.value,
                          }))
                        }
                        placeholder="https://..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                      />
                      {activeRoom.scanUrl ? (
                        <a
                          href={activeRoom.scanUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-cyan-700 hover:text-cyan-800"
                        >
                          Open 3D scan
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Room summary</label>
                    <textarea
                      rows={3}
                      value={activeRoom.summary}
                      onChange={(e) =>
                        updateActiveRoom((room) => ({
                          ...room,
                          summary: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Access notes</label>
                    <textarea
                      rows={3}
                      value={activeRoom.accessNotes}
                      onChange={(e) =>
                        updateActiveRoom((room) => ({
                          ...room,
                          accessNotes: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Recommendations</label>
                    <textarea
                      rows={3}
                      value={activeRoom.recommendations}
                      onChange={(e) =>
                        updateActiveRoom((room) => ({
                          ...room,
                          recommendations: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border border-white bg-white p-3 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Room photos</h3>
                    <ChatImageUploader
                      onFilesSelected={setPendingFiles}
                      maxImages={10}
                      disabled={uploading}
                      isUploading={uploading}
                      uploadingCount={pendingFiles.length}
                      clearKey={uploaderClearKey}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void uploadImages()}
                        disabled={uploading || pendingFiles.length === 0}
                        className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
                      >
                        {uploading ? 'Uploading...' : 'Upload selected images'}
                      </button>
                    </div>

                    {activeRoom.photos.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {activeRoom.photos.map((photo, index) => (
                            <button
                              key={`${photo.storageKey || photo.imageUrl || index}`}
                              type="button"
                              onClick={() => setSelectedPhotoIndex(index)}
                              className={`overflow-hidden rounded border ${selectedPhotoIndex === index ? 'border-cyan-500' : 'border-slate-300'}`}
                            >
                              <img
                                src={resolveMediaAssetUrl(photo.imageUrl || photo.storageKey || '')}
                                alt={`Room photo ${index + 1}`}
                                className="h-14 w-14 object-cover"
                              />
                            </button>
                          ))}
                        </div>

                        {activePhoto ? (
                          <div className="space-y-2">
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-slate-700">New marker color</label>
                              <input
                                type="color"
                                value={newPointColor}
                                onChange={(e) => setNewPointColor(e.target.value)}
                                className="h-9 w-16 rounded border border-slate-300"
                              />
                            </div>
                            <div className="relative inline-block overflow-hidden rounded-lg border border-slate-300">
                              <img
                                src={resolveMediaAssetUrl(activePhoto.imageUrl || activePhoto.storageKey || '')}
                                alt="Active room photo"
                                className="max-h-[320px] w-auto cursor-crosshair"
                                onClick={handleImageClick}
                              />
                              {points.map((point, index) => (
                                <span
                                  key={`${point.x}-${point.y}-${index}`}
                                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow"
                                  style={{
                                    left: `${toNumber(point.x)}%`,
                                    top: `${toNumber(point.y)}%`,
                                    backgroundColor: point.color || '#ef4444',
                                  }}
                                  title={point.note || `Point ${index + 1}`}
                                />
                              ))}
                            </div>

                            <input
                              value={activePhoto.caption || ''}
                              onChange={(e) =>
                                updateActivePhoto((photo) => ({
                                  ...photo,
                                  caption: e.target.value,
                                }))
                              }
                              placeholder="Photo caption"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
                            />

                            <div className="space-y-2">
                              {points.map((point, index) => (
                                <div key={`point-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[80px_1fr_auto]">
                                  <div className="text-xs text-slate-600">#{index + 1} ({point.x.toFixed(1)}%, {point.y.toFixed(1)}%)</div>
                                  <input
                                    value={point.note || ''}
                                    onChange={(e) =>
                                      updateActivePhoto((photo) => ({
                                        ...photo,
                                        markup: {
                                          points: (photo.markup?.points || []).map((current, currentIndex) =>
                                            currentIndex === index ? { ...current, note: e.target.value } : current,
                                          ),
                                        },
                                      }))
                                    }
                                    placeholder="Marker note"
                                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-cyan-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActivePhoto((photo) => ({
                                        ...photo,
                                        markup: {
                                          points: (photo.markup?.points || []).filter((_, currentIndex) => currentIndex !== index),
                                        },
                                      }))
                                    }
                                    className="rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Upload survey photos to start marking up this room.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || submitting}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Submit this survey report for client approval?')) return;
                void submitForApproval();
              }}
              disabled={saving || submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
