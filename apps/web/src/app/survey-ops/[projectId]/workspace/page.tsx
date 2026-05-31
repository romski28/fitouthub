'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useRoleGuard } from '@/hooks/use-role-guard';
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
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState<string[]>([]);
  const [selectedRoomIndex, setSelectedRoomIndex] = useState(0);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [activeMarkerIndex, setActiveMarkerIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [newPointColor, setNewPointColor] = useState('#ef4444');
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const markerNoteRefs = useRef<Array<HTMLDivElement | null>>([]);

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
  const localDraftKey = useMemo(
    () => `survey-workspace-draft:${projectId}:${surveyExtraId}`,
    [projectId, surveyExtraId],
  );

  useEffect(() => {
    return () => {
      pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingPreviewUrls]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!editorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editorOpen]);

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
      let localDraft: Partial<WorkspaceReport> | null = null;
      if (typeof window !== 'undefined') {
        const rawDraft = window.sessionStorage.getItem(localDraftKey);
        if (rawDraft) {
          try {
            localDraft = JSON.parse(rawDraft) as Partial<WorkspaceReport>;
          } catch {
            window.sessionStorage.removeItem(localDraftKey);
          }
        }
      }

      const mergedReport: Partial<WorkspaceReport> = localDraft
        ? {
            ...report,
            ...localDraft,
            rooms: Array.isArray(localDraft.rooms) ? localDraft.rooms : report.rooms,
          }
        : report;
      const mergedRooms = normalizeRooms(
        mergedReport.rooms,
        Array.isArray(mergedReport.photos) ? mergedReport.photos : [],
        initialRoomCount,
      );

      setForm({
        id: mergedReport.id || report.id || null,
        status: mergedReport.status || report.status || 'draft',
        title: mergedReport.title || report.title || '',
        summary: mergedReport.summary || report.summary || '',
        accessNotes: mergedReport.accessNotes || report.accessNotes || '',
        recommendations: mergedReport.recommendations || report.recommendations || '',
        rooms: mergedRooms,
        photos: flattenRoomPhotos(mergedRooms),
        submittedAt: mergedReport.submittedAt || report.submittedAt || null,
        updatedAt: mergedReport.updatedAt || report.updatedAt || null,
      });
      setSelectedRoomIndex(0);
      setSelectedPhotoIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load survey workspace');
    } finally {
      setLoading(false);
    }
  }, [accessToken, initialRoomCount, localDraftKey, projectId, surveyExtraId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!projectId || !surveyExtraId || typeof window === 'undefined') return;

    const draftToPersist = {
      id: form.id,
      status: form.status,
      title: form.title,
      summary: form.summary,
      accessNotes: form.accessNotes,
      recommendations: form.recommendations,
      rooms: form.rooms,
      photos: form.photos,
      submittedAt: form.submittedAt,
      updatedAt: form.updatedAt,
    };

    window.sessionStorage.setItem(localDraftKey, JSON.stringify(draftToPersist));
  }, [form, localDraftKey, projectId, surveyExtraId]);

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
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(localDraftKey);
      }
      setSuccess('Draft saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save survey draft');
    } finally {
      setSaving(false);
    }
  }, [accessToken, form, localDraftKey, projectId, surveyExtraId]);

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
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(localDraftKey);
      }
      setSuccess('Submitted for client approval');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit survey report');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, localDraftKey, projectId, surveyExtraId]);

  const handleFilesSelected = (files: File[]) => {
    pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPendingFiles(files);
    setPendingPreviewUrls(files.map((file) => URL.createObjectURL(file)));
  };

  const removePendingFile = (index: number) => {
    URL.revokeObjectURL(pendingPreviewUrls[index]);
    const nextFiles = pendingFiles.filter((_, fileIndex) => fileIndex !== index);
    const nextUrls = pendingPreviewUrls.filter((_, urlIndex) => urlIndex !== index);
    setPendingFiles(nextFiles);
    setPendingPreviewUrls(nextUrls);
  };

  const clearPendingFiles = () => {
    pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPendingFiles([]);
    setPendingPreviewUrls([]);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  };

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
      clearPendingFiles();
      setSuccess('Images uploaded. Save draft to persist room markup changes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setUploading(false);
    }
  }, [activeRoom, clearPendingFiles, form.rooms, pendingFiles, selectedRoomIndex]);

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

  const removePhotoAtIndex = (photoIndex: number) => {
    setForm((prev) => {
      const room = prev.rooms[selectedRoomIndex];
      if (!room) return prev;

      const nextRooms = [...prev.rooms];
      const nextRoomPhotos = (room.photos || []).filter((_, index) => index !== photoIndex);
      nextRooms[selectedRoomIndex] = {
        ...room,
        photos: nextRoomPhotos,
      };

      const nextSelectedIndex = Math.max(0, Math.min(selectedPhotoIndex, nextRoomPhotos.length - 1));
      setSelectedPhotoIndex(nextSelectedIndex);
      if (nextRoomPhotos.length === 0) {
        setEditorOpen(false);
      }
      setActiveMarkerIndex(null);

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

    const nextMarkerIndex = points.length;
    setActiveMarkerIndex(nextMarkerIndex);
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

  useEffect(() => {
    if (!editorOpen) return;
    if (activeMarkerIndex === null) return;
    const markerRow = markerNoteRefs.current[activeMarkerIndex];
    if (markerRow) {
      markerRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeMarkerIndex, editorOpen]);

  const setActivePhotoAndOpenEditor = (photoIndex: number) => {
    setSelectedPhotoIndex(photoIndex);
    setActiveMarkerIndex(null);
    setEditorOpen(true);
  };

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
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-28 pt-6 sm:px-6 lg:px-8">
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
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={galleryInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            handleFilesSelected(files);
                            event.currentTarget.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={uploading}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {uploading ? 'Uploading...' : 'Select images'}
                        </button>
                        {pendingFiles.length > 0 ? (
                          <span className="text-xs text-slate-500">
                            {pendingFiles.length} image{pendingFiles.length === 1 ? '' : 's'} ready to upload
                          </span>
                        ) : null}
                      </div>

                      {pendingPreviewUrls.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {pendingPreviewUrls.map((previewUrl, index) => (
                              <div key={`${previewUrl}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-300 bg-white">
                                <img
                                  src={previewUrl}
                                  alt={pendingFiles[index]?.name || `Pending upload ${index + 1}`}
                                  className="h-20 w-20 object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePendingFile(index)}
                                  className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow"
                                  aria-label={`Remove pending image ${index + 1}`}
                                >
                                  x
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void uploadImages()}
                              disabled={uploading || pendingFiles.length === 0}
                              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
                            >
                              {uploading ? 'Uploading...' : `Upload ${pendingFiles.length} image${pendingFiles.length === 1 ? '' : 's'}`}
                            </button>
                            <button
                              type="button"
                              onClick={clearPendingFiles}
                              disabled={uploading}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                            >
                              Clear selection
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {activeRoom.photos.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {activeRoom.photos.map((photo, index) => (
                            <div
                              key={`${photo.storageKey || photo.imageUrl || index}`}
                              className={`relative overflow-hidden rounded border ${selectedPhotoIndex === index ? 'border-cyan-500' : 'border-slate-300'}`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPhotoIndex(index);
                                  setActiveMarkerIndex(null);
                                }}
                                className="block"
                              >
                                <img
                                  src={resolveMediaAssetUrl(photo.imageUrl || photo.storageKey || '')}
                                  alt={`Room photo ${index + 1}`}
                                  className="h-20 w-20 object-cover"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => removePhotoAtIndex(index)}
                                className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow"
                                aria-label={`Remove photo ${index + 1}`}
                                title="Remove image"
                              >
                                x
                              </button>
                              <button
                                type="button"
                                onClick={() => setActivePhotoAndOpenEditor(index)}
                                className="absolute bottom-0 left-0 right-0 bg-slate-900/75 px-1 py-0.5 text-[10px] font-semibold text-white"
                              >
                                Edit
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Upload survey photos to start marking up this room.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {editorOpen && activePhoto ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm sm:p-6">
          <div className="w-full max-w-6xl rounded-3xl border border-white/40 bg-[#d8d1bc]/92 p-3 shadow-[0_22px_60px_rgba(15,23,42,0.35)] backdrop-blur-md sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-3">
                <h2 className="text-[28px] font-semibold text-[#1f2434]">Image editor</h2>
                <div>
                  <label className="mb-1 block text-[30px] font-medium text-[#1f2434]">Image caption</label>
                  <input
                    value={activePhoto.caption || ''}
                    onChange={(e) =>
                      updateActivePhoto((photo) => ({
                        ...photo,
                        caption: e.target.value,
                      }))
                    }
                    placeholder=""
                    className="w-full rounded-xl border border-[#f1e9d8] bg-[#f8f2e5] px-3 py-2 text-sm text-[#1f2434] outline-none focus:border-[#2b4b64]"
                  />
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-[#ebe1cb] bg-[#ece8de] p-1">
                  <img
                    src={resolveMediaAssetUrl(activePhoto.imageUrl || activePhoto.storageKey || '')}
                    alt="Active room photo"
                    className="max-h-[64vh] w-full cursor-crosshair rounded-xl object-contain"
                    onClick={handleImageClick}
                  />
                  {points.map((point, index) => {
                    const markerActive = activeMarkerIndex === index;
                    return (
                      <button
                        key={`${point.x}-${point.y}-${index}`}
                        type="button"
                        onClick={() => setActiveMarkerIndex(index)}
                        className={`absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-sm font-bold shadow ${markerActive ? 'ring-2 ring-[#2b4b64]/50 ring-offset-2 ring-offset-[#ece8de]' : ''}`}
                        style={{
                          left: `${toNumber(point.x)}%`,
                          top: `${toNumber(point.y)}%`,
                          backgroundColor: point.color || '#ff7f66',
                          color: '#f8f2e5',
                          borderColor: '#f8f2e5',
                        }}
                        title={point.note || `Point ${index + 1}`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex h-[64vh] min-h-[420px] flex-col rounded-2xl border border-[#ebe1cb] bg-[#ece8de] p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-[32px] font-medium text-[#1f2434]">Marker Notes</p>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#31495f]">
                    Marker color
                    <input
                      type="color"
                      value={newPointColor}
                      onChange={(e) => setNewPointColor(e.target.value)}
                      className="h-8 w-10 rounded border border-[#d4c9b2]"
                    />
                  </label>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {points.length === 0 ? <p className="px-2 py-1 text-sm text-[#5f6b74]">Tap image to drop a marker.</p> : null}
                  {points.map((point, index) => {
                    const rowActive = activeMarkerIndex === index;
                    return (
                      <div
                        key={`point-${index}`}
                        ref={(element) => {
                          markerNoteRefs.current[index] = element;
                        }}
                        className={`rounded-xl border p-2 ${rowActive ? 'border-[#2b4b64] bg-[#f6efdf]' : 'border-[#d9ccaf] bg-[#f8f2e5]'}`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveMarkerIndex(index)}
                          className="mb-2 flex w-full items-center gap-2 text-left"
                        >
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold"
                            style={{
                              backgroundColor: point.color || '#ff7f66',
                              color: '#f8f2e5',
                              borderColor: '#f8f2e5',
                            }}
                          >
                            {index + 1}
                          </span>
                        </button>
                        <input
                          value={point.note || ''}
                          onFocus={() => setActiveMarkerIndex(index)}
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
                          placeholder="Type your marker note"
                          className="w-full rounded-lg border border-[#d4c9b2] bg-[#fffaf0] px-2 py-2 text-sm text-[#1f2434] outline-none focus:border-[#2b4b64]"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMarkerIndex((current) => {
                                if (current === null) return null;
                                if (current === index) return null;
                                if (current > index) return current - 1;
                                return current;
                              });
                              updateActivePhoto((photo) => ({
                                ...photo,
                                markup: {
                                  points: (photo.markup?.points || []).filter((_, currentIndex) => currentIndex !== index),
                                },
                              }));
                            }}
                            className="text-xl"
                            aria-label={`Remove marker ${index + 1}`}
                            title="Remove marker"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditorOpen(false);
                      setActiveMarkerIndex(null);
                    }}
                    className="rounded-lg bg-amber-400 px-3 py-2 text-lg font-semibold text-[#f8f2e5]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={saving}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-lg font-semibold text-[#f8f2e5] disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
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
      </div>
    </div>
  );
}
