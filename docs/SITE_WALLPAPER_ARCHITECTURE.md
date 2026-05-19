# Site Wallpaper Architecture

## Current state

The site wallpaper now mounts once from the root app layout instead of being recreated inside each page.

Current files:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/site-wallpaper-shell.tsx`
- `apps/web/src/lib/site-wallpaper.ts`

This solves the visible wallpaper drop/reappear effect during navigation because the background layer stays mounted while page content changes.

## Why this is future-proof

The wallpaper shell no longer hardcodes only a single DOM structure and image choice.

`apps/web/src/lib/site-wallpaper.ts` now provides:

- a wallpaper key
- a season bucket
- a time-of-day bucket
- a rotation token
- a refresh interval
- a single selection function for pathname-aware wallpaper choice

Right now all buckets still resolve to the existing `hero-homepage-empty.webp` asset, so behavior is unchanged visually.

## Planned future rotation path

When new artwork exists, extend only `getSiteWallpaperSelection(...)` and the wallpaper registry it uses.

Recommended evolution:

1. Add more wallpaper keys such as `spring-morning-clear`, `summer-afternoon-rain`, `winter-evening-clear`.
2. Map each key to an image path and overlay treatment.
3. Keep the shell mounted and only swap `imagePath` and overlay class.
4. Add a weather condition bucket later, but keep it coarse: `clear`, `cloudy`, `rain`, `storm`.
5. Cache weather state and refresh it on an interval instead of per navigation.

## Why the shell refreshes on an interval

The wallpaper shell re-evaluates on pathname change and on a timed interval.

That means future time-based rotation can occur while a user remains on the same page, without requiring a navigation event.

Current refresh interval:

- `15 minutes`

This can be tuned later in `getSiteWallpaperRefreshMs()`.

## Route behavior

Wallpaper is currently hidden for:

- `/admin`
- `/get-started`

That rule lives in `shouldHideSiteWallpaper(...)`.

If more exclusions are needed later, add them there instead of scattering layout exceptions across pages.

## Navbar relationship

The navbar now sits above the persistent wallpaper shell and uses client-side `Link` navigation for internal page changes.

That keeps both pieces of chrome stable during route transitions.

## If weather is added later

Recommended source of truth:

- fetch weather once in a small client-side controller or cached API route
- normalize it to a small condition bucket
- feed that bucket into `getSiteWallpaperSelection(...)`

Avoid:

- calling a weather API on every route change
- mounting wallpaper logic in individual pages
- coupling wallpaper selection to page-specific components