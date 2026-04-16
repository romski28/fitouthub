'use client';

import React from 'react';
import Link from 'next/link';

const COVERAGE_PER_LITER = 10; // m^2 per liter, rough planning value

export default function PaintCalculatorPage() {
  const [roomLength, setRoomLength] = React.useState('');
  const [roomWidth, setRoomWidth] = React.useState('');
  const [wallHeight, setWallHeight] = React.useState('');
  const [doorWindowArea, setDoorWindowArea] = React.useState('');
  const [coats, setCoats] = React.useState('2');

  const metrics = React.useMemo(() => {
    const length = Number(roomLength);
    const width = Number(roomWidth);
    const height = Number(wallHeight);
    const openings = Number(doorWindowArea || '0');
    const coatCount = Number(coats || '1');

    if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
    }

    const perimeter = 2 * (length + width);
    const grossWallArea = perimeter * height;
    const netWallArea = Math.max(0, grossWallArea - (Number.isFinite(openings) ? Math.max(0, openings) : 0));
    const totalArea = netWallArea * Math.max(1, Math.round(coatCount));
    const liters = totalArea / COVERAGE_PER_LITER;

    return {
      grossWallArea,
      netWallArea,
      totalArea,
      liters,
      litersRounded: Math.ceil(liters),
    };
  }, [roomLength, roomWidth, wallHeight, doorWindowArea, coats]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-3 rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-300">Docs &amp; Tools</p>
          <h1 className="text-3xl font-bold">Paint Quantity Calculator</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Fast wall paint estimate for planning. Enter room dimensions, remove door/window area, and choose coats.
          </p>
          <Link href="/docs" className="inline-block rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
            Back to Docs &amp; Tools
          </Link>
        </header>

        <section className="grid gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm text-slate-300">Room length (m)</span>
            <input value={roomLength} onChange={(e) => setRoomLength(e.target.value)} type="number" min="0.1" step="0.1" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" placeholder="4.2" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-300">Room width (m)</span>
            <input value={roomWidth} onChange={(e) => setRoomWidth(e.target.value)} type="number" min="0.1" step="0.1" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" placeholder="3.5" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-300">Wall height (m)</span>
            <input value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} type="number" min="0.1" step="0.1" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" placeholder="2.6" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-300">Door/window area to exclude (m^2)</span>
            <input value={doorWindowArea} onChange={(e) => setDoorWindowArea(e.target.value)} type="number" min="0" step="0.1" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" placeholder="3" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-slate-300">Number of coats</span>
            <input value={coats} onChange={(e) => setCoats(e.target.value)} type="number" min="1" step="1" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" placeholder="2" />
          </label>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          {!metrics ? (
            <p className="text-sm text-slate-300">Enter valid room dimensions to generate an estimate.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Net wall area</p>
                <p className="mt-2 text-xl font-semibold text-emerald-300">{metrics.netWallArea.toFixed(2)} m^2</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Paint needed (rounded)</p>
                <p className="mt-2 text-xl font-semibold text-sky-300">{metrics.litersRounded} L</p>
                <p className="mt-1 text-xs text-slate-400">Raw estimate: {metrics.liters.toFixed(2)} L</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
