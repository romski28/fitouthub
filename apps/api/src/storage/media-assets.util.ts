const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

export const extractObjectKeyFromValue = (value?: string | null): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (isHttpUrl(raw)) {
    try {
      const parsed = new URL(raw);
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
    } catch {
      return raw;
    }
  }

  return raw.replace(/^\/+/, '').trim();
};

export const buildPublicAssetUrl = (
  objectKey: string,
  fallbackBaseUrl = 'https://uploads.example.com',
): string => {
  const raw = String(objectKey || '').trim();
  if (!raw) return '';

  // If the value is already a full HTTP URL, return it as-is.
  // This handles assets that were stored as fully-resolved R2 URLs.
  if (isHttpUrl(raw)) return raw;

  const key = raw.replace(/^\/+/, '');
  if (!key) return '';

  const configuredBase = String(process.env.PUBLIC_ASSETS_BASE_URL || '').trim();
  const baseUrl = trimTrailingSlash(configuredBase || fallbackBaseUrl);
  return `${baseUrl}/${key}`;
};
