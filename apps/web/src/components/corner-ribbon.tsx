'use client';

import { useState } from 'react';
import { ribbonConfig } from '@/config/ribbon';

export default function CornerRibbon() {
  const [isVisible, setIsVisible] = useState(true);

  // Don't render if disabled in config
  if (!ribbonConfig.enabled || !isVisible) return null;

  const handleClick = () => {
    if (ribbonConfig.link) {
      window.location.href = ribbonConfig.link;
    }
  };

  const RibbonContent = (
    <>
      <button
        onClick={() => setIsVisible(false)}
        className="absolute top-2 right-2 w-6 h-6 bg-white text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold hover:bg-slate-100 transition z-10"
        aria-label="Close ribbon"
      >
        ✕
      </button>
      <div className={`text-center ${ribbonConfig.colors.text} text-[10px] font-bold px-4 leading-tight`}>
        <div>{ribbonConfig.text}</div>
      </div>
    </>
  );

  return (
    <div className="fixed top-0 right-0 z-50 w-32 h-32 overflow-hidden pointer-events-none">
      {ribbonConfig.link ? (
        <button
          onClick={handleClick}
          className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl ${ribbonConfig.colors.background} transform rotate-45 -translate-y-24 translate-x-24 flex flex-col items-center justify-end pointer-events-auto pb-6 cursor-pointer hover:opacity-90 transition`}
        >
          {RibbonContent}
        </button>
      ) : (
        <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl ${ribbonConfig.colors.background} transform rotate-45 -translate-y-24 translate-x-24 flex flex-col items-center justify-end pointer-events-auto pb-6`}>
          {RibbonContent}
        </div>
      )}
    </div>
  );
}
