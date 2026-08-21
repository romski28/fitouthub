'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { PropertyAddressPicker, type PropertyAddressValue } from './property-address-picker';

export type AddressMode = 'single' | 'multi' | 'none';

type LinkedProperty = {
  id: string;
  buildingName: string;
  displayAddress: string | null;
  unitNumber: string | null;
  floorLevel: string | null;
  blockTower: string | null;
  linkId: string;
  linkRole: string | null;
  isPrimary: boolean;
};

const emptyValue = (): PropertyAddressValue => ({
  buildingName: '',
  buildingNameZh: null,
  unitNumber: '',
  floorLevel: '',
  blockTower: '',
  districtAreaId: '',
  districtName: '',
  lat: null,
  lng: null,
  propertyId: '',
});

export function AddressManager({ accessToken, mode }: { accessToken: string; mode: AddressMode }) {
  const [properties, setProperties] = useState<LinkedProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PropertyAddressValue>(emptyValue());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const data = await res.json();
      setProperties(data.properties ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (mode !== 'none') load();
  }, [mode, load]);

  const openAdd = () => {
    setDraft(emptyValue());
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (
      !draft.buildingName.trim() ||
      !draft.unitNumber.trim() ||
      !draft.floorLevel.trim() ||
      !draft.districtAreaId.trim()
    ) {
      setError('Building, unit, floor and district are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1. Upsert the canonical property (dedupe + canonical key + geo).
      const propRes = await fetch(`${API_BASE_URL}/properties`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingName: draft.buildingName,
          unitNumber: draft.unitNumber,
          floorLevel: draft.floorLevel,
          blockTower: draft.blockTower || undefined,
          districtAreaId: draft.districtAreaId,
          lat: draft.lat ?? undefined,
          lng: draft.lng ?? undefined,
        }),
      });
      if (!propRes.ok) {
        const e = await propRes.json().catch(() => ({}));
        throw new Error(e.message || 'Failed to save address');
      }
      const propData = await propRes.json();
      const propertyId = propData?.property?.id;
      if (!propertyId) throw new Error('No property id returned');

      // 2. Link to the current persona (cardinality enforced server-side).
      const linkRes = await fetch(`${API_BASE_URL}/properties/${propertyId}/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ setPrimary: mode === 'multi' ? properties.length === 0 : undefined }),
      });
      if (!linkRes.ok) {
        const e = await linkRes.json().catch(() => ({}));
        throw new Error(e.message || 'Failed to link address');
      }

      setEditing(false);
      setDraft(emptyValue());
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (propertyId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/link`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to remove address');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (propertyId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/primary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to set primary');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'none') {
    return <p className="text-sm text-slate-500">Your address is shown from your employer or the client you assist.</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {loading && <p className="text-xs text-slate-400">Loading addresses…</p>}

      {!loading && properties.length === 0 && (
        <p className="text-xs text-slate-500">No address saved yet.</p>
      )}

      {!loading && properties.map((p) => (
        <div key={p.linkId} className="flex items-start justify-between gap-3 rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.82)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{p.displayAddress || p.buildingName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {[p.blockTower, p.floorLevel ? `${p.floorLevel}/F` : null, p.unitNumber ? `Flat ${p.unitNumber}` : null].filter(Boolean).join(' · ')}
            </p>
            {p.isPrimary && (
              <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Primary
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {mode === 'multi' && !p.isPrimary && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPrimary(p.id)}
                className="rounded-lg border border-[rgba(120,53,15,0.14)] px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-[rgba(239,231,207,0.7)] disabled:opacity-50"
              >
                Set primary
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => unlink(p.id)}
              className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        disabled={busy}
        onClick={openAdd}
        className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] px-4 py-2 text-sm font-semibold text-[#b94e2d] hover:bg-[rgba(239,231,207,0.7)] disabled:opacity-50"
      >
        {properties.length === 0 ? '＋ Add address' : mode === 'single' ? 'Change address' : '＋ Add another address'}
      </button>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,24,16,0.48)] px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.98)] p-6 shadow-[0_30px_80px_rgba(33,24,16,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff7f50]">Address</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{properties.length === 0 ? 'Add address' : 'Change address'}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full border border-[rgba(120,53,15,0.14)] px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-[rgba(239,231,207,0.7)]"
              >
                Close
              </button>
            </div>

            <div className="mt-5">
              <PropertyAddressPicker accessToken={accessToken} value={draft} onChange={setDraft} />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-2xl border border-[rgba(120,53,15,0.14)] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[rgba(239,231,207,0.7)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded-2xl bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a84426] disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save address'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
