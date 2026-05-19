export type SiteWallpaperKey = 'homepage-empty';

export type SiteWallpaperSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export type SiteWallpaperTimeBucket =
  | 'late-night'
  | 'morning'
  | 'afternoon'
  | 'evening';

export type SiteWallpaperSelection = {
  key: SiteWallpaperKey;
  imagePath: string;
  overlayClassName: string;
  season: SiteWallpaperSeason;
  timeBucket: SiteWallpaperTimeBucket;
  rotationToken: string;
};

const SITE_WALLPAPER_REFRESH_MS = 15 * 60 * 1000;

export function getSiteWallpaperRefreshMs() {
  return SITE_WALLPAPER_REFRESH_MS;
}

export function shouldHideSiteWallpaper(pathname?: string | null) {
  if (!pathname) {
    return false;
  }

  return pathname.startsWith('/admin') || pathname === '/get-started';
}

export function getSiteWallpaperSeason(now: Date) : SiteWallpaperSeason {
  const month = now.getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return 'spring';
  }
  if (month >= 6 && month <= 8) {
    return 'summer';
  }
  if (month >= 9 && month <= 11) {
    return 'autumn';
  }

  return 'winter';
}

export function getSiteWallpaperTimeBucket(now: Date): SiteWallpaperTimeBucket {
  const hour = now.getHours();

  if (hour < 6) {
    return 'late-night';
  }
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }

  return 'evening';
}

export function getSiteWallpaperSelection(params: {
  pathname?: string | null;
  now?: Date;
}): SiteWallpaperSelection | null {
  const pathname = params.pathname;
  if (shouldHideSiteWallpaper(pathname)) {
    return null;
  }

  const now = params.now ?? new Date();
  const season = getSiteWallpaperSeason(now);
  const timeBucket = getSiteWallpaperTimeBucket(now);

  return {
    key: 'homepage-empty',
    imagePath: '/assets/images/hero-homepage-empty.webp',
    overlayClassName: 'bg-[#1a1a1a]/44',
    season,
    timeBucket,
    rotationToken: `${season}:${timeBucket}`,
  };
}