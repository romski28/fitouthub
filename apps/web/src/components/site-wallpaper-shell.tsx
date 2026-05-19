'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  getSiteWallpaperRefreshMs,
  getSiteWallpaperSelection,
  type SiteWallpaperSelection,
} from '@/lib/site-wallpaper';

export function SiteWallpaperShell() {
  const pathname = usePathname();
  const [wallpaper, setWallpaper] = useState<SiteWallpaperSelection | null>(() =>
    getSiteWallpaperSelection({ pathname, now: new Date() }),
  );

  useEffect(() => {
    const updateWallpaper = () => {
      setWallpaper(getSiteWallpaperSelection({ pathname, now: new Date() }));
    };

    updateWallpaper();
    const intervalId = window.setInterval(updateWallpaper, getSiteWallpaperRefreshMs());

    return () => window.clearInterval(intervalId);
  }, [pathname]);

  if (!wallpaper) {
    return null;
  }

  return (
    <div
      aria-hidden
      data-wallpaper-key={wallpaper.key}
      data-wallpaper-season={wallpaper.season}
      data-wallpaper-time={wallpaper.timeBucket}
      data-wallpaper-rotation={wallpaper.rotationToken}
      className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-500"
    >
      <div
        className="h-full w-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${wallpaper.imagePath}')` }}
      />
      <div className={`absolute inset-0 ${wallpaper.overlayClassName}`} />
    </div>
  );
}