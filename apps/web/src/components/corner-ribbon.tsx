'use client';

import { useState } from 'react';

export default function CornerRibbon() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 right-0 z-50 w-32 h-32 overflow-hidden pointer-events-none">
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500 via-emerald-600 to-emerald-700 transform rotate-45 -translate-y-24 translate-x-24 flex flex-col items-center justify-end pointer-events-auto pb-6">
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 w-6 h-6 bg-white text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold hover:bg-slate-100 transition"
        >
          ✕
        </button>
        <div className="text-center text-white text-[10px] font-bold px-4 leading-tight">
          <div>Start your project today!</div>
        </div>
      </div>
    </div>
  );
}
