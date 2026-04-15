'use client';

import React from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import {
  calculateRoom,
  calculateSummary,
  formatBtu,
  formatUnitSize,
  type CalculationMethod,
  type HeatProfile,
  type RoomInput,
} from '@/lib/ac-calculator';

type SavedAcProject = {
  id: string;
  updatedAt?: string;
  title: string;
  notes?: string | null;
  calculationMethod: CalculationMethod;
  combineRooms: boolean;
  linkedProjectId?: string | null;
  totalBtu?: number | null;
  recommendedSystem?: string | null;
  compressorSuggestion?: string | null;
  shoppingList?: Array<{ unitSize: number; count: number }> | null;
  rooms: Array<{
    id: string;
    name: string;
    lengthMeters: number;
    widthMeters: number;
    heightMeters: number;
    heatProfile: HeatProfile;
    occupants: number;
    floor?: number | null;
    westFacing?: boolean;
    largeWindows?: boolean;
    calculatedArea?: number | null;
    calculatedVolume?: number | null;
    calculatedBtu?: number | null;
    suggestedUnitSize?: number | null;
    recommendedAcType?: string | null;
    notes?: string[] | null;
  }>;
};

type ClientProjectOption = {
  id: string;
  projectName: string;
  status?: string | null;
};

type DraftRoom = {
  name: string;
  lengthMeters: string;
  widthMeters: string;
  heightMeters: string;
  heatProfile: HeatProfile;
  occupants: string;
  floor: string;
  westFacing: boolean;
  largeWindows: boolean;
};

type DraftFieldErrors = {
  name: string;
  lengthMeters: string;
  widthMeters: string;
  heightMeters: string;
  occupants: string;
};

type ShareableSnapshot = {
  title: string;
  notes: string;
  combineRooms: boolean;
  rooms: Array<{
    name: string;
    lengthMeters: number;
    widthMeters: number;
    heightMeters: number;
    heatProfile: HeatProfile;
    occupants: number;
    floor?: number;
    westFacing: boolean;
    largeWindows: boolean;
  }>;
};

const createDraftRoom = (): DraftRoom => ({
  name: '',
  lengthMeters: '',
  widthMeters: '',
  heightMeters: '',
  heatProfile: 'warm',
  occupants: '',
  floor: '',
  westFacing: false,
  largeWindows: false,
});

const parsePositiveNumber = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseOccupants = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.max(1, Math.round(parsed));
};

const validateDraftRoom = (draft: DraftRoom): { canAdd: boolean; errors: DraftFieldErrors } => {
  const errors: DraftFieldErrors = {
    name: draft.name.trim() ? '' : 'Room name is required.',
    lengthMeters: parsePositiveNumber(draft.lengthMeters) !== null ? '' : 'Length must be greater than 0.',
    widthMeters: parsePositiveNumber(draft.widthMeters) !== null ? '' : 'Width must be greater than 0.',
    heightMeters: parsePositiveNumber(draft.heightMeters) !== null ? '' : 'Height must be greater than 0.',
    occupants: parseOccupants(draft.occupants) !== null ? '' : 'Occupants must be at least 1.',
  };

  return {
    canAdd: Object.values(errors).every((error) => !error),
    errors,
  };
};

const createPlanSnapshot = (args: {
  title: string;
  notes: string;
  combineRooms: boolean;
  saveToLinkLater: boolean;
  linkedProjectId: string;
  rooms: RoomInput[];
}): string => {
  const snapshot = {
    title: args.title,
    notes: args.notes,
    combineRooms: args.combineRooms,
    linkedProjectId: args.saveToLinkLater ? null : args.linkedProjectId || null,
    rooms: args.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      lengthMeters: room.lengthMeters,
      widthMeters: room.widthMeters,
      heightMeters: room.heightMeters,
      heatProfile: room.heatProfile,
      occupants: room.occupants,
      floor: room.floor ?? null,
      westFacing: Boolean(room.westFacing),
      largeWindows: Boolean(room.largeWindows),
    })),
  };

  return JSON.stringify(snapshot);
};

const buildRoomFromDraft = (draft: DraftRoom, roomIndex: number): { room: RoomInput | null; error: string } => {
  const lengthMeters = parsePositiveNumber(draft.lengthMeters);
  const widthMeters = parsePositiveNumber(draft.widthMeters);
  const heightMeters = parsePositiveNumber(draft.heightMeters);
  const occupants = parseOccupants(draft.occupants || '1');

  if (!draft.name.trim()) {
    return { room: null, error: 'Please add a room name before adding this room.' };
  }

  if (lengthMeters === null || widthMeters === null || heightMeters === null) {
    return { room: null, error: 'Length, width, and height must be greater than 0.' };
  }

  if (occupants === null) {
    return { room: null, error: 'Occupants must be at least 1.' };
  }

  const parsedFloor = draft.floor.trim() ? Number(draft.floor) : undefined;

  return {
    room: {
      id: `room-${Date.now()}-${roomIndex + 1}`,
      name: draft.name.trim(),
      lengthMeters,
      widthMeters,
      heightMeters,
      heatProfile: draft.heatProfile,
      occupants,
      floor: Number.isFinite(parsedFloor as number) ? parsedFloor : undefined,
      westFacing: draft.westFacing,
      largeWindows: draft.largeWindows,
    },
    error: '',
  };
};

export default function AcCalculatorPage() {
  const { isLoggedIn, accessToken, user } = useAuth();
  const {
    isLoggedIn: professionalLoggedIn,
    accessToken: professionalAccessToken,
    professional,
  } = useProfessionalAuth();

  const token = accessToken || professionalAccessToken || null;
  const canSave = Boolean(token && (isLoggedIn || professionalLoggedIn));
  const isClientUser = Boolean(accessToken && isLoggedIn && !professionalLoggedIn);
  const isProfessionalUser = Boolean(professionalLoggedIn);
  const actorLabel = user?.nickname || professional?.fullName || professional?.email || 'you';

  const [title, setTitle] = React.useState('My Hong Kong AC Plan');
  const [notes, setNotes] = React.useState('');
  const [combineRooms, setCombineRooms] = React.useState(true);
  const calculationMethod: CalculationMethod = 'area';
  const [showExpertInputs, setShowExpertInputs] = React.useState(false);
  const [draftRoom, setDraftRoom] = React.useState<DraftRoom>(createDraftRoom());
  const [draftMessage, setDraftMessage] = React.useState('');
  const [draftAttemptedAdd, setDraftAttemptedAdd] = React.useState(false);
  const [rooms, setRooms] = React.useState<RoomInput[]>([]);
  const [editingRoomId, setEditingRoomId] = React.useState<string | null>(null);
  const [editingDraft, setEditingDraft] = React.useState<DraftRoom>(createDraftRoom());
  const [editingMessage, setEditingMessage] = React.useState('');
  const [savedProjects, setSavedProjects] = React.useState<SavedAcProject[]>([]);
  const [clientProjects, setClientProjects] = React.useState<ClientProjectOption[]>([]);
  const [activeSavedId, setActiveSavedId] = React.useState<string | null>(null);
  const [saveToLinkLater, setSaveToLinkLater] = React.useState(true);
  const [linkedProjectId, setLinkedProjectId] = React.useState('');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = React.useState('');
  const [loadingSaved, setLoadingSaved] = React.useState(false);
  const [savedSnapshot, setSavedSnapshot] = React.useState('');
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [shareMessage, setShareMessage] = React.useState('');

  const hasRooms = rooms.length > 0;
  const roomResults = React.useMemo(
    () => rooms.map((room) => calculateRoom(room, calculationMethod, combineRooms)),
    [rooms, calculationMethod, combineRooms],
  );
  const summary = React.useMemo(
    () => (hasRooms ? calculateSummary(roomResults, combineRooms) : null),
    [hasRooms, roomResults, combineRooms],
  );
  const draftValidation = React.useMemo(() => validateDraftRoom(draftRoom), [draftRoom]);
  const canAddDraftRoom = draftValidation.canAdd;
  const currentSnapshot = React.useMemo(
    () =>
      createPlanSnapshot({
        title,
        notes,
        combineRooms,
        saveToLinkLater,
        linkedProjectId,
        rooms,
      }),
    [title, notes, combineRooms, saveToLinkLater, linkedProjectId, rooms],
  );
  const isDirty = savedSnapshot ? currentSnapshot !== savedSnapshot : hasRooms;

  React.useEffect(() => {
    if (!savedSnapshot) {
      setSavedSnapshot(currentSnapshot);
    }
  }, [currentSnapshot, savedSnapshot]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('shared');
    if (!encoded) return;

    try {
      const shared = JSON.parse(decodeURIComponent(encoded)) as ShareableSnapshot;
      if (!Array.isArray(shared.rooms) || shared.rooms.length === 0) return;

      setTitle(shared.title || 'Shared AC Plan');
      setNotes(shared.notes || '');
      setCombineRooms(Boolean(shared.combineRooms));
      setRooms(
        shared.rooms.map((room, index) => ({
          id: `shared-room-${Date.now()}-${index + 1}`,
          name: room.name || `Room ${index + 1}`,
          lengthMeters: Number(room.lengthMeters) || 1,
          widthMeters: Number(room.widthMeters) || 1,
          heightMeters: Number(room.heightMeters) || 2.6,
          heatProfile: (room.heatProfile || 'warm') as HeatProfile,
          occupants: Math.max(1, Number(room.occupants) || 1),
          floor: room.floor,
          westFacing: Boolean(room.westFacing),
          largeWindows: Boolean(room.largeWindows),
        })),
      );
      setDraftMessage('Shared plan loaded from link.');
      setSavedSnapshot('');
    } catch {
      setDraftMessage('Unable to read shared plan from link.');
    }
  }, []);

  const refreshSavedProjects = React.useCallback(async () => {
    if (!token) return;
    try {
      setLoadingSaved(true);
      const response = await fetch(`${API_BASE_URL}/ac-projects`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load saved AC plans');
      }
      const data = await response.json();
      setSavedProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to load saved plans');
    } finally {
      setLoadingSaved(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (canSave) {
      refreshSavedProjects();
    }
  }, [canSave, refreshSavedProjects]);

  React.useEffect(() => {
    if (!isClientUser || !accessToken) {
      setClientProjects([]);
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/projects`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Failed to load projects');
        }

        const data = await response.json();
        const rows = Array.isArray(data) ? data : data?.projects || [];
        if (cancelled) return;

        setClientProjects(
          rows
            .map((project: { id?: unknown; projectName?: unknown; status?: unknown }) => ({
              id: String(project?.id || ''),
              projectName: String(project?.projectName || 'Untitled project'),
              status: project?.status ? String(project.status) : null,
            }))
            .filter((project: ClientProjectOption) => project.id.length > 0),
        );
      } catch {
        if (!cancelled) {
          setClientProjects([]);
        }
      }
    };

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [isClientUser, accessToken]);

  const clearDraftForm = () => {
    setDraftRoom(createDraftRoom());
    setDraftMessage('');
    setDraftAttemptedAdd(false);
  };

  const addDraftRoom = () => {
    setDraftAttemptedAdd(true);
    const { room, error } = buildRoomFromDraft(draftRoom, rooms.length);
    if (!room) {
      setDraftMessage(error);
      return;
    }

    setRooms((prev) => [...prev, room]);
    setDraftRoom(createDraftRoom());
    setDraftMessage('Room added to report.');
    setSaveMessage('');
    setDraftAttemptedAdd(false);
  };

  const removeRoom = (id: string) => {
    setRooms((prev) => prev.filter((room) => room.id !== id));
    if (editingRoomId === id) {
      setEditingRoomId(null);
      setEditingDraft(createDraftRoom());
      setEditingMessage('');
    }
  };

  const startEditRoom = (room: RoomInput) => {
    setEditingRoomId(room.id);
    setEditingDraft({
      name: room.name,
      lengthMeters: String(room.lengthMeters),
      widthMeters: String(room.widthMeters),
      heightMeters: String(room.heightMeters),
      heatProfile: room.heatProfile,
      occupants: String(room.occupants),
      floor: room.floor === undefined ? '' : String(room.floor),
      westFacing: Boolean(room.westFacing),
      largeWindows: Boolean(room.largeWindows),
    });
    setEditingMessage('');
  };

  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setEditingDraft(createDraftRoom());
    setEditingMessage('');
  };

  const saveEditedRoom = () => {
    if (!editingRoomId) return;
    const roomIndex = rooms.findIndex((room) => room.id === editingRoomId);
    const { room, error } = buildRoomFromDraft(editingDraft, roomIndex >= 0 ? roomIndex : 0);
    if (!room) {
      setEditingMessage(error);
      return;
    }

    setRooms((prev) => prev.map((existing) => (existing.id === editingRoomId ? { ...room, id: editingRoomId } : existing)));
    setEditingMessage('Room updated.');
    setEditingRoomId(null);
    setEditingDraft(createDraftRoom());
    setSaveMessage('');
  };

  const resetCalculator = () => {
    setActiveSavedId(null);
    setTitle('My Hong Kong AC Plan');
    setNotes('');
    setCombineRooms(true);
    setShowExpertInputs(false);
    setRooms([]);
    setDraftRoom(createDraftRoom());
    setDraftMessage('');
    setDraftAttemptedAdd(false);
    setEditingRoomId(null);
    setEditingDraft(createDraftRoom());
    setEditingMessage('');
    setSaveToLinkLater(true);
    setLinkedProjectId('');
    setSaveState('idle');
    setSaveMessage('');
    setShareMessage('');
    setLastSavedAt(null);
    setSavedSnapshot(
      createPlanSnapshot({
        title: 'My Hong Kong AC Plan',
        notes: '',
        combineRooms: true,
        saveToLinkLater: true,
        linkedProjectId: '',
        rooms: [],
      }),
    );
  };

  const hydrateFromSaved = (saved: SavedAcProject) => {
    setActiveSavedId(saved.id);
    setTitle(saved.title);
    setNotes(saved.notes || '');
    setCombineRooms(Boolean(saved.combineRooms));
    setSaveToLinkLater(!saved.linkedProjectId);
    setLinkedProjectId(saved.linkedProjectId || '');
    const hydratedRooms = saved.rooms.map((room, index) => ({
        id: room.id || `room-${Date.now()}-${index + 1}`,
        name: room.name,
        lengthMeters: Number(room.lengthMeters) || 1,
        widthMeters: Number(room.widthMeters) || 1,
        heightMeters: Number(room.heightMeters) || 2.6,
        heatProfile: (room.heatProfile || 'warm') as HeatProfile,
        occupants: Math.max(1, Number(room.occupants) || 1),
        floor: room.floor ?? undefined,
        westFacing: Boolean(room.westFacing),
        largeWindows: Boolean(room.largeWindows),
      }));
    setRooms(hydratedRooms);
    setDraftRoom(createDraftRoom());
    setDraftMessage('Saved plan loaded.');
    setDraftAttemptedAdd(false);
    setEditingRoomId(null);
    setEditingDraft(createDraftRoom());
    setEditingMessage('');
    setSaveState('saved');
    setSaveMessage('Saved plan loaded.');
    setShareMessage('');
    setLastSavedAt(saved.updatedAt || new Date().toISOString());
    setSavedSnapshot(
      createPlanSnapshot({
        title: saved.title,
        notes: saved.notes || '',
        combineRooms: Boolean(saved.combineRooms),
        saveToLinkLater: !saved.linkedProjectId,
        linkedProjectId: saved.linkedProjectId || '',
        rooms: hydratedRooms,
      }),
    );
  };

  const buildPayload = () => ({
    title,
    notes,
    calculationMethod,
    combineRooms,
    linkedProjectId: saveToLinkLater ? null : linkedProjectId || null,
    totalBtu: summary?.totalBtu ?? null,
    recommendedSystem: summary?.recommendedSystem ?? null,
    compressorSuggestion: summary?.compressorSuggestion ?? null,
    shoppingList: summary?.shoppingList ?? [],
    rooms: roomResults.map((room) => ({
      name: room.name,
      lengthMeters: room.lengthMeters,
      widthMeters: room.widthMeters,
      heightMeters: room.heightMeters,
      heatProfile: room.heatProfile,
      occupants: room.occupants,
      floor: room.floor,
      westFacing: room.westFacing,
      largeWindows: room.largeWindows,
      calculatedArea: room.areaSqm,
      calculatedVolume: room.volumeCbm,
      calculatedBtu: room.calculatedBtu,
      suggestedUnitSize: room.suggestedUnitSize,
      recommendedAcType: room.recommendedAcType,
      notes: room.notes,
    })),
  });

  const saveProject = async () => {
    if (!token) return;
    if (!hasRooms) {
      setSaveState('error');
      setSaveMessage('Add at least one room before saving this plan.');
      return;
    }
    try {
      setSaveState('saving');
      setSaveMessage('Saving your AC plan...');
      const response = await fetch(
        activeSavedId ? `${API_BASE_URL}/ac-projects/${activeSavedId}` : `${API_BASE_URL}/ac-projects`,
        {
          method: activeSavedId ? 'PUT' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildPayload()),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to save AC plan');
      }
      const saved = await response.json();
      setActiveSavedId(saved.id);
      setSaveState('saved');
      setSaveMessage('AC plan saved for later.');
      setSavedSnapshot(currentSnapshot);
      setLastSavedAt(new Date().toISOString());
      await refreshSavedProjects();
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save AC plan');
    }
  };

  const exportSummaryPdf = () => {
    if (!hasRooms) {
      setShareMessage('Add at least one room before exporting.');
      return;
    }
    window.print();
  };

  const copyShareLink = async () => {
    if (!hasRooms) {
      setShareMessage('Add at least one room before creating a share link.');
      return;
    }

    const sharePayload: ShareableSnapshot = {
      title,
      notes,
      combineRooms,
      rooms: rooms.map((room) => ({
        name: room.name,
        lengthMeters: room.lengthMeters,
        widthMeters: room.widthMeters,
        heightMeters: room.heightMeters,
        heatProfile: room.heatProfile,
        occupants: room.occupants,
        floor: room.floor ?? undefined,
        westFacing: Boolean(room.westFacing),
        largeWindows: Boolean(room.largeWindows),
      })),
    };

    const url = new URL(window.location.href);
    url.searchParams.set('shared', encodeURIComponent(JSON.stringify(sharePayload)));

    try {
      await navigator.clipboard.writeText(url.toString());
      setShareMessage('Share link copied.');
    } catch {
      setShareMessage('Unable to copy link automatically. Please copy from the browser address bar.');
    }
  };

  const deleteSavedProject = async (id: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/ac-projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to delete saved AC plan');
      }
      if (activeSavedId === id) {
        resetCalculator();
      }
      await refreshSavedProjects();
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to delete saved AC plan');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-300">Docs &amp; Tools</p>
              <h1 className="text-3xl font-bold">Air-Conditioning Calculator</h1>
              <p className="max-w-3xl text-sm text-slate-300">
                A friendly first-pass helper for Hong Kong homes. Enter one room at a time, add it to your report, and save your plan if needed.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/docs" className="rounded-lg border border-white/20 px-4 py-2 text-slate-200 hover:bg-white/10">
                Back to Docs &amp; Tools
              </Link>
              <Link href="/docs/user-manual" className="rounded-lg border border-white/20 px-4 py-2 text-slate-200 hover:bg-white/10">
                User Manual
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Plan name</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  placeholder="e.g. Happy Valley AC refresh"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className={isDirty ? 'text-amber-300' : 'text-emerald-300'}>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
                {lastSavedAt ? <span className="text-slate-400">Last saved: {new Date(lastSavedAt).toLocaleString()}</span> : null}
              </div>

              {isProfessionalUser ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">Expert inputs</span>
                  <button
                    type="button"
                    onClick={() => setShowExpertInputs((prev) => !prev)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${showExpertInputs ? 'border border-sky-500/40 bg-sky-500/20 text-sky-200' : 'border border-slate-700 bg-slate-800 text-slate-200'}`}
                  >
                    {showExpertInputs ? 'Expert mode on' : 'Expert mode'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Room entry</p>

              <div className="space-y-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                  <label className="block w-full space-y-2 xl:flex-1">
                    <span className="text-sm text-slate-300">Room name</span>
                    <input
                      value={draftRoom.name}
                      onChange={(e) => setDraftRoom((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      placeholder="e.g. Living Room"
                    />
                    {draftAttemptedAdd && draftValidation.errors.name ? <p className="text-xs text-rose-300">{draftValidation.errors.name}</p> : null}
                  </label>

                  <div className="w-full xl:flex-[1.2]">
                    <div className="grid grid-cols-3 gap-3 sm:gap-4">
                      <label className="block space-y-2">
                        <span className="text-sm text-slate-300">Length (m)</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={draftRoom.lengthMeters}
                          onChange={(e) => setDraftRoom((prev) => ({ ...prev, lengthMeters: e.target.value }))}
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                          placeholder="3.2"
                        />
                        {draftAttemptedAdd && draftValidation.errors.lengthMeters ? (
                          <p className="text-xs text-rose-300">{draftValidation.errors.lengthMeters}</p>
                        ) : null}
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm text-slate-300">Width (m)</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={draftRoom.widthMeters}
                          onChange={(e) => setDraftRoom((prev) => ({ ...prev, widthMeters: e.target.value }))}
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                          placeholder="2.8"
                        />
                        {draftAttemptedAdd && draftValidation.errors.widthMeters ? (
                          <p className="text-xs text-rose-300">{draftValidation.errors.widthMeters}</p>
                        ) : null}
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm text-slate-300">Height (m)</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={draftRoom.heightMeters}
                          onChange={(e) => setDraftRoom((prev) => ({ ...prev, heightMeters: e.target.value }))}
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                          placeholder="2.6"
                        />
                        {draftAttemptedAdd && draftValidation.errors.heightMeters ? (
                          <p className="text-xs text-rose-300">{draftValidation.errors.heightMeters}</p>
                        ) : null}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    <label className="block space-y-2">
                      <span className="text-sm text-slate-300">Room feels</span>
                      <select
                        value={draftRoom.heatProfile}
                        onChange={(e) => setDraftRoom((prev) => ({ ...prev, heatProfile: e.target.value as HeatProfile }))}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      >
                        <option value="cool">Cool</option>
                        <option value="warm">Warm</option>
                        <option value="hot">Hot</option>
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm text-slate-300">Occupants</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={draftRoom.occupants}
                        onChange={(e) => setDraftRoom((prev) => ({ ...prev, occupants: e.target.value }))}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                        placeholder="1"
                      />
                      {draftAttemptedAdd && draftValidation.errors.occupants ? (
                        <p className="text-xs text-rose-300">{draftValidation.errors.occupants}</p>
                      ) : null}
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm text-slate-300">Floor</span>
                      <input
                        type="number"
                        step="1"
                        value={draftRoom.floor}
                        onChange={(e) => setDraftRoom((prev) => ({ ...prev, floor: e.target.value }))}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                        placeholder="Optional, e.g. 12"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {isProfessionalUser && showExpertInputs ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm text-slate-300">West-facing / afternoon sun</span>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(draftRoom.westFacing)}
                        onChange={(e) => setDraftRoom((prev) => ({ ...prev, westFacing: e.target.checked }))}
                      />
                    </div>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-slate-300">Large windows / more glazing</span>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(draftRoom.largeWindows)}
                        onChange={(e) => setDraftRoom((prev) => ({ ...prev, largeWindows: e.target.checked }))}
                      />
                    </div>
                  </label>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 border-t border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={addDraftRoom}
                  disabled={!canAddDraftRoom}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add this room
                </button>
                <button
                  type="button"
                  onClick={clearDraftForm}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={resetCalculator}
                  className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/10"
                >
                  Reset all
                </button>
              </div>

              {draftMessage ? (
                <p className={`text-sm ${draftMessage === 'Room added to report.' ? 'text-emerald-300' : 'text-rose-300'}`}>{draftMessage}</p>
              ) : null}
            </div>

            {!hasRooms ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                <p className="text-sm text-slate-300">Add at least one room to generate the report.</p>
              </div>
            ) : (
              <div className="min-w-0 space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3">
                  <p className="text-sm font-medium text-white">System preference</p>
                  <p className="mt-1 text-xs text-slate-400">This sets whether you are planning room-by-room units or exploring a shared system approach.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCombineRooms(true)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${combineRooms ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                    >
                      Can use shared system
                    </button>
                    <button
                      type="button"
                      onClick={() => setCombineRooms(false)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${!combineRooms ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                    >
                      Use room-by-room units
                    </button>
                  </div>
                </div>

                {editingRoomId ? (
                  <div className="space-y-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
                    <p className="text-sm font-semibold text-sky-200">Editing room</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <input
                        value={editingDraft.name}
                        onChange={(e) => setEditingDraft((prev) => ({ ...prev, name: e.target.value }))}
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        placeholder="Room name"
                      />
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={editingDraft.lengthMeters}
                        onChange={(e) => setEditingDraft((prev) => ({ ...prev, lengthMeters: e.target.value }))}
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        placeholder="Length"
                      />
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={editingDraft.widthMeters}
                        onChange={(e) => setEditingDraft((prev) => ({ ...prev, widthMeters: e.target.value }))}
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        placeholder="Width"
                      />
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={editingDraft.heightMeters}
                        onChange={(e) => setEditingDraft((prev) => ({ ...prev, heightMeters: e.target.value }))}
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        placeholder="Height"
                      />
                      <select
                        value={editingDraft.heatProfile}
                        onChange={(e) => setEditingDraft((prev) => ({ ...prev, heatProfile: e.target.value as HeatProfile }))}
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                      >
                        <option value="cool">Cool</option>
                        <option value="warm">Warm</option>
                        <option value="hot">Hot</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editingDraft.occupants}
                        onChange={(e) => setEditingDraft((prev) => ({ ...prev, occupants: e.target.value }))}
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        placeholder="Occupants"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={saveEditedRoom}
                        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                      >
                        Save room changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditRoom}
                        className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                    {editingMessage ? <p className="text-xs text-rose-200">{editingMessage}</p> : null}
                  </div>
                ) : null}

                <div className="space-y-3 md:hidden">
                  {roomResults.map((room) => (
                    <div key={`${room.id}-card`} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-white">{room.name}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditRoom(room)}
                            className="rounded border border-sky-500/40 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/10"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRoom(room.id)}
                            className="rounded border border-rose-500/40 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                        <p>L × W × H: {room.lengthMeters.toFixed(1)} × {room.widthMeters.toFixed(1)} × {room.heightMeters.toFixed(1)}</p>
                        <p>Area: {room.areaSqm.toFixed(2)} m²</p>
                        <p>Heat: {room.heatProfile}</p>
                        <p>Occupants: {room.occupants}</p>
                        <p className="text-emerald-300">Load: {formatBtu(room.calculatedBtu)}</p>
                        <p>Unit: {formatUnitSize(room.suggestedUnitSize)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden max-w-full overflow-x-auto rounded-xl border border-slate-700 md:block">
                  <table className="min-w-full whitespace-nowrap text-sm">
                    <thead className="bg-slate-950">
                      <tr className="text-left text-slate-300">
                        <th className="px-3 py-2 font-semibold">Room</th>
                        <th className="px-3 py-2 font-semibold">L (m)</th>
                        <th className="px-3 py-2 font-semibold">W (m)</th>
                        <th className="px-3 py-2 font-semibold">H (m)</th>
                        <th className="px-3 py-2 font-semibold">Area (m²)</th>
                        <th className="px-3 py-2 font-semibold">Heat</th>
                        <th className="px-3 py-2 font-semibold">Occupants</th>
                        <th className="px-3 py-2 font-semibold">BTU</th>
                        <th className="px-3 py-2 font-semibold">Suggested unit</th>
                        <th className="px-3 py-2 font-semibold">AC type</th>
                        <th className="px-3 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roomResults.map((room) => (
                        <tr key={room.id} className="border-t border-slate-800 bg-slate-900/50">
                          <td className="px-3 py-2 text-white">{room.name}</td>
                          <td className="px-3 py-2 text-slate-200">{room.lengthMeters.toFixed(1)}</td>
                          <td className="px-3 py-2 text-slate-200">{room.widthMeters.toFixed(1)}</td>
                          <td className="px-3 py-2 text-slate-200">{room.heightMeters.toFixed(1)}</td>
                          <td className="px-3 py-2 text-slate-200">{room.areaSqm.toFixed(2)}</td>
                          <td className="px-3 py-2 text-slate-200">{room.heatProfile}</td>
                          <td className="px-3 py-2 text-slate-200">{room.occupants}</td>
                          <td className="px-3 py-2 text-emerald-300">{formatBtu(room.calculatedBtu)}</td>
                          <td className="px-3 py-2 text-slate-200">{formatUnitSize(room.suggestedUnitSize)}</td>
                          <td className="px-3 py-2 text-slate-200">{room.recommendedAcType}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => startEditRoom(room)}
                              className="mr-2 rounded border border-sky-500/40 px-2 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRoom(room.id)}
                              className="rounded border border-rose-500/40 px-2 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {summary ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Total load</p>
                        <p className="mt-2 text-lg font-semibold text-emerald-300">{formatBtu(summary.totalBtu)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 md:col-span-2">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Recommended whole-home approach</p>
                        <p className="mt-2 text-sm text-slate-200">{summary.recommendedSystem}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Compressor thinking</p>
                      <p className="mt-2 text-sm text-slate-200">{summary.compressorSuggestion}</p>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Shopping list</p>
                      <ul className="mt-2 space-y-2 text-sm text-slate-200">
                        {summary.shoppingList.map((item) => (
                          <li key={item.unitSize} className="flex items-center justify-between">
                            <span>{formatUnitSize(item.unitSize)}</span>
                            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">× {item.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">How this estimate works</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                        <li>Uses room area as the core load estimate for a first-pass sizing check.</li>
                        <li>Adjusts recommendation by room heat profile and occupancy assumptions.</li>
                        <li>Does not replace on-site inspection, insulation checks, or pipe-run constraints.</li>
                      </ul>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={exportSummaryPdf}
                        className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        Export PDF
                      </button>
                      <button
                        type="button"
                        onClick={copyShareLink}
                        className="rounded-lg border border-sky-500/40 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
                      >
                        Copy share link
                      </button>
                    </div>

                    {shareMessage ? <p className="text-xs text-slate-300">{shareMessage}</p> : null}

                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <p className="text-sm font-semibold text-amber-200">Before you buy</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
                        {summary.summaryNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>

          <aside className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Saved plans</p>
                  <p className="text-xs text-slate-400">{canSave ? `Signed in as ${actorLabel}` : 'Sign in to use saved plans'}</p>
                </div>
                {canSave ? (
                  <button
                    type="button"
                    onClick={refreshSavedProjects}
                    className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                ) : null}
              </div>

              {canSave ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Friendly planner notes (optional)</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-24 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      placeholder="Anything you want to remember when saving this plan..."
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Save mode</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSaveToLinkLater(true)}
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${saveToLinkLater ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                      >
                        Save and link later
                      </button>
                      <button
                        type="button"
                        onClick={() => setSaveToLinkLater(false)}
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${!saveToLinkLater ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                      >
                        Link now
                      </button>
                    </div>
                  </label>

                  {!saveToLinkLater && isClientUser ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-200">Choose a project to attach now</span>
                      <select
                        value={linkedProjectId}
                        onChange={(e) => setLinkedProjectId(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      >
                        <option value="">Select a project</option>
                        {clientProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.projectName}
                            {project.status ? ` (${project.status})` : ''}
                          </option>
                        ))}
                      </select>
                      {clientProjects.length === 0 ? (
                        <p className="text-xs text-amber-200">No formal client projects found yet.</p>
                      ) : null}
                    </label>
                  ) : null}

                  {!saveToLinkLater && !isClientUser ? (
                    <p className="text-xs text-slate-400">Project linking is currently available for signed-in client project owners.</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={saveProject}
                    disabled={saveState === 'saving'}
                    className="w-full rounded-lg border border-sky-400/40 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/10 disabled:opacity-70"
                  >
                    {saveState === 'saving' ? 'Saving...' : activeSavedId ? 'Update saved plan' : 'Save for later'}
                  </button>
                </>
              ) : null}

              {saveMessage ? (
                <p className={`text-sm ${saveState === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{saveMessage}</p>
              ) : null}

              {canSave ? (
                <p className={`text-xs ${isDirty ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {isDirty ? 'You have unsaved changes.' : 'Saved state is up to date.'}
                </p>
              ) : null}

              {!canSave ? (
                <p className="text-sm text-slate-400">Saved plans are available after sign in.</p>
              ) : loadingSaved ? (
                <p className="text-sm text-slate-400">Loading saved plans...</p>
              ) : savedProjects.length === 0 ? (
                <p className="text-sm text-slate-400">No saved AC plans yet.</p>
              ) : (
                <div className="space-y-3">
                  {savedProjects.map((project) => (
                    <div
                      key={project.id}
                      className={`rounded-xl border p-4 ${activeSavedId === project.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 bg-slate-950/70'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{project.title}</p>
                          <p className="text-xs text-slate-400">
                            {project.rooms.length} room{project.rooms.length === 1 ? '' : 's'} • {project.totalBtu ? formatBtu(project.totalBtu) : 'Draft'}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {project.linkedProjectId ? 'Linked to a formal project' : 'Saved to link later'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteSavedProject(project.id)}
                          className="text-xs font-semibold text-rose-300 hover:text-rose-200"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => hydrateFromSaved(project)}
                          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                          Load plan
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
