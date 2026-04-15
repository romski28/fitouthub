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

const createRoom = (index: number): RoomInput => ({
  id: `room-${Date.now()}-${index}`,
  name: index === 0 ? 'Living Room' : `Room ${index + 1}`,
  lengthMeters: 3.2,
  widthMeters: 2.8,
  heightMeters: 2.6,
  heatProfile: 'warm',
  occupants: 1,
  floor: undefined,
  westFacing: false,
  largeWindows: false,
});

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
  const actorLabel = user?.nickname || professional?.fullName || professional?.email || 'you';

  const [title, setTitle] = React.useState('My Hong Kong AC Plan');
  const [notes, setNotes] = React.useState('');
  const [combineRooms, setCombineRooms] = React.useState(false);
  const [calculationMethod, setCalculationMethod] = React.useState<CalculationMethod>('area');
  const [rooms, setRooms] = React.useState<RoomInput[]>([createRoom(0)]);
  const [savedProjects, setSavedProjects] = React.useState<SavedAcProject[]>([]);
  const [clientProjects, setClientProjects] = React.useState<ClientProjectOption[]>([]);
  const [activeSavedId, setActiveSavedId] = React.useState<string | null>(null);
  const [saveToLinkLater, setSaveToLinkLater] = React.useState(true);
  const [linkedProjectId, setLinkedProjectId] = React.useState('');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = React.useState('');
  const [loadingSaved, setLoadingSaved] = React.useState(false);

  const roomResults = React.useMemo(
    () => rooms.map((room) => calculateRoom(room, calculationMethod, combineRooms)),
    [rooms, calculationMethod, combineRooms],
  );
  const summary = React.useMemo(
    () => calculateSummary(roomResults, combineRooms),
    [roomResults, combineRooms],
  );

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
            .map((project: any) => ({
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

  const updateRoom = (id: string, patch: Partial<RoomInput>) => {
    setRooms((prev) => prev.map((room) => (room.id === id ? { ...room, ...patch } : room)));
  };

  const addRoom = () => {
    setRooms((prev) => [...prev, createRoom(prev.length)]);
  };

  const removeRoom = (id: string) => {
    setRooms((prev) => (prev.length > 1 ? prev.filter((room) => room.id !== id) : prev));
  };

  const resetCalculator = () => {
    setActiveSavedId(null);
    setTitle('My Hong Kong AC Plan');
    setNotes('');
    setCombineRooms(false);
    setCalculationMethod('area');
    setRooms([createRoom(0)]);
    setSaveToLinkLater(true);
    setLinkedProjectId('');
    setSaveState('idle');
    setSaveMessage('');
  };

  const hydrateFromSaved = (saved: SavedAcProject) => {
    setActiveSavedId(saved.id);
    setTitle(saved.title);
    setNotes(saved.notes || '');
    setCombineRooms(Boolean(saved.combineRooms));
    setSaveToLinkLater(!saved.linkedProjectId);
    setLinkedProjectId(saved.linkedProjectId || '');
    setCalculationMethod(saved.calculationMethod || 'area');
    setRooms(
      saved.rooms.map((room, index) => ({
        id: room.id || createRoom(index).id,
        name: room.name,
        lengthMeters: Number(room.lengthMeters) || 1,
        widthMeters: Number(room.widthMeters) || 1,
        heightMeters: Number(room.heightMeters) || 2.6,
        heatProfile: (room.heatProfile || 'warm') as HeatProfile,
        occupants: Math.max(1, Number(room.occupants) || 1),
        floor: room.floor ?? undefined,
        westFacing: Boolean(room.westFacing),
        largeWindows: Boolean(room.largeWindows),
      })),
    );
    setSaveState('saved');
    setSaveMessage('Saved plan loaded.');
  };

  const buildPayload = () => ({
    title,
    notes,
    calculationMethod,
    combineRooms,
    linkedProjectId: saveToLinkLater ? null : linkedProjectId || null,
    totalBtu: summary.totalBtu,
    recommendedSystem: summary.recommendedSystem,
    compressorSuggestion: summary.compressorSuggestion,
    shoppingList: summary.shoppingList,
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
      await refreshSavedProjects();
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save AC plan');
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
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-300">Docs &amp; Tools</p>
              <h1 className="text-3xl font-bold">Air-Conditioning Calculator</h1>
              <p className="max-w-3xl text-sm text-slate-300">
                A friendly first-pass helper for Hong Kong homes. Add rooms, estimate BTU needs, compare likely unit types,
                and keep a saved scenario if you are logged in.
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

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">Plan name</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                    placeholder="e.g. Happy Valley AC refresh"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">Calculation mode</span>
                  <select
                    value={calculationMethod}
                    onChange={(e) => setCalculationMethod(e.target.value as CalculationMethod)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  >
                    <option value="area">Area method (sqm × 700)</option>
                    <option value="volume">Volume method (cbm × 250)</option>
                  </select>
                </label>
              </div>

              <label className="space-y-2 block">
                <span className="text-sm font-medium text-slate-200">Friendly planner notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  placeholder="Any site quirks? Tall windows, direct sun, landlord limits, or future project ideas..."
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3">
                <div>
                  <p className="font-medium text-white">Combine rooms for one shared system?</p>
                  <p className="text-xs text-slate-400">Useful when you are thinking about ducted, multi-split, or a whole-zone solution.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCombineRooms((prev) => !prev)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${combineRooms ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                >
                  {combineRooms ? 'Combined' : 'Separate rooms'}
                </button>
              </label>

              {canSave && (
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 space-y-3">
                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">Save to link to project later?</p>
                      <p className="text-xs text-slate-400">
                        Keep this AC plan as a standalone helper now, or attach it to an existing formal project.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSaveToLinkLater((prev) => !prev)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${saveToLinkLater ? 'bg-emerald-500 text-slate-950' : 'bg-sky-500/20 text-sky-200'}`}
                    >
                      {saveToLinkLater ? 'Yes' : 'No'}
                    </button>
                  </label>

                  {!saveToLinkLater && isClientUser && (
                    <label className="space-y-2 block">
                      <span className="text-sm font-medium text-slate-200">Choose a project to attach now</span>
                      <select
                        value={linkedProjectId}
                        onChange={(e) => setLinkedProjectId(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      >
                        <option value="">Select a project</option>
                        {clientProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.projectName}{project.status ? ` (${project.status})` : ''}
                          </option>
                        ))}
                      </select>
                      {clientProjects.length === 0 ? (
                        <p className="text-xs text-amber-200">No formal client projects found yet, so this plan will stay standalone until one exists.</p>
                      ) : null}
                    </label>
                  )}

                  {!saveToLinkLater && !isClientUser && (
                    <p className="text-xs text-slate-400">
                      Project linking is currently enabled for signed-in client project owners. Professional accounts can still save standalone plans.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {rooms.map((room, index) => (
                <div key={room.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Room {index + 1}</p>
                      <h2 className="text-xl font-semibold text-white">{room.name || `Room ${index + 1}`}</h2>
                    </div>
                    {rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRoom(room.id)}
                        className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                      >
                        Remove room
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Room name</span>
                      <input value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Length (m)</span>
                      <input type="number" min="0.1" step="0.1" value={room.lengthMeters} onChange={(e) => updateRoom(room.id, { lengthMeters: Number(e.target.value) })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Width (m)</span>
                      <input type="number" min="0.1" step="0.1" value={room.widthMeters} onChange={(e) => updateRoom(room.id, { widthMeters: Number(e.target.value) })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Height (m)</span>
                      <input type="number" min="0.1" step="0.1" value={room.heightMeters} onChange={(e) => updateRoom(room.id, { heightMeters: Number(e.target.value) })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">General room feel</span>
                      <select value={room.heatProfile} onChange={(e) => updateRoom(room.id, { heatProfile: e.target.value as HeatProfile })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400">
                        <option value="cool">Cool</option>
                        <option value="warm">Warm</option>
                        <option value="hot">Hot</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Occupants</span>
                      <input type="number" min="1" step="1" value={room.occupants} onChange={(e) => updateRoom(room.id, { occupants: Number(e.target.value) })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Floor</span>
                      <input type="number" step="1" value={room.floor ?? ''} onChange={(e) => updateRoom(room.id, { floor: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400" placeholder="Optional" />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">
                      <input type="checkbox" checked={Boolean(room.westFacing)} onChange={(e) => updateRoom(room.id, { westFacing: e.target.checked })} />
                      West-facing / afternoon sun
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">
                      <input type="checkbox" checked={Boolean(room.largeWindows)} onChange={(e) => updateRoom(room.id, { largeWindows: e.target.checked })} />
                      Large windows / more glazing
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Area</p>
                      <p className="mt-1 text-lg font-semibold text-white">{roomResults[index].areaSqm.toFixed(2)} m²</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Cooling load</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-300">{formatBtu(roomResults[index].calculatedBtu)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">AC type</p>
                      <p className="mt-1 text-lg font-semibold text-white">{roomResults[index].recommendedAcType}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Suggested size</p>
                      <p className="mt-1 text-lg font-semibold text-white">{formatUnitSize(roomResults[index].suggestedUnitSize)}</p>
                    </div>
                  </div>

                  {roomResults[index].notes.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <p className="text-sm font-semibold text-amber-200">Notes for this room</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
                        {roomResults[index].notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={addRoom} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                + Add another room
              </button>
              <button type="button" onClick={resetCalculator} className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Start fresh
              </button>
              {canSave ? (
                <button type="button" onClick={saveProject} disabled={saveState === 'saving'} className="rounded-lg border border-sky-400/40 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/10 disabled:opacity-70">
                  {saveState === 'saving' ? 'Saving...' : activeSavedId ? 'Update saved plan' : 'Save for later'}
                </button>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-600 px-4 py-2 text-sm text-slate-400">
                  Log in to save this AC plan for later.
                </div>
              )}
            </div>
            {saveMessage && (
              <p className={`text-sm ${saveState === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{saveMessage}</p>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Home summary</p>
                <h2 className="mt-1 text-2xl font-bold text-white">{formatBtu(summary.totalBtu)}</h2>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Recommended whole-home approach</p>
                <p className="mt-2 text-sm text-slate-200">{summary.recommendedSystem}</p>
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

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-200">Before you buy</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
                  {summary.summaryNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Saved plans</p>
                  <p className="text-xs text-slate-400">{canSave ? `Signed in as ${actorLabel}` : 'Available after login'}</p>
                </div>
                {canSave && (
                  <button type="button" onClick={refreshSavedProjects} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    Refresh
                  </button>
                )}
              </div>

              {!canSave ? (
                <p className="text-sm text-slate-400">Sign in to store multiple apartment cooling scenarios and revisit them later.</p>
              ) : loadingSaved ? (
                <p className="text-sm text-slate-400">Loading saved plans...</p>
              ) : savedProjects.length === 0 ? (
                <p className="text-sm text-slate-400">No saved AC plans yet.</p>
              ) : (
                <div className="space-y-3">
                  {savedProjects.map((project) => (
                    <div key={project.id} className={`rounded-xl border p-4 ${activeSavedId === project.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 bg-slate-950/70'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{project.title}</p>
                          <p className="text-xs text-slate-400">{project.rooms.length} room{project.rooms.length === 1 ? '' : 's'} • {project.totalBtu ? formatBtu(project.totalBtu) : 'Draft'}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {project.linkedProjectId ? 'Linked to a formal project' : 'Saved to link later'}
                          </p>
                        </div>
                        <button type="button" onClick={() => deleteSavedProject(project.id)} className="text-xs font-semibold text-rose-300 hover:text-rose-200">
                          Delete
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => hydrateFromSaved(project)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
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
