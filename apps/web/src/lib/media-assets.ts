import { API_BASE_URL } from '@/config/api';

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
      return raw.replace(/^\/+/, '').trim();
    }
  }

  return raw.replace(/^\/+/, '').trim();
};

export const resolveMediaAssetUrl = (value?: string | null): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const apiBase = trimTrailingSlash(API_BASE_URL);
  const apiOrigin = apiBase.replace(/\/api$/i, '');

  if (raw.startsWith('http://localhost:3001') || raw.startsWith('https://localhost:3001')) {
    return raw.replace(/^https?:\/\/localhost:3001/i, apiOrigin);
  }

  if (isHttpUrl(raw)) return raw;

  const key = extractObjectKeyFromValue(raw);
  if (!key) return '';

  const configuredBase = String(process.env.NEXT_PUBLIC_ASSETS_BASE_URL || '').trim();
  const assetsBase = trimTrailingSlash(configuredBase || apiOrigin);
  return `${assetsBase}/${key}`;
};

export const resolveMediaAssetUrls = (values?: Array<string | null | undefined>): string[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => resolveMediaAssetUrl(value))
    .filter((value) => value.length > 0);
};

type UploadResponse = {
  keys?: unknown[];
  urls?: unknown[];
  files?: Array<{ key?: unknown; url?: unknown }>;
};

export const getUploadResponseKeys = (payload: UploadResponse | null | undefined): string[] => {
  if (!payload) return [];

  if (Array.isArray(payload.keys) && payload.keys.length > 0) {
    return payload.keys.map((value: unknown) => extractObjectKeyFromValue(String(value || ''))).filter(Boolean);
  }

  if (Array.isArray(payload.files) && payload.files.length > 0) {
    return payload.files
      .map((file) => extractObjectKeyFromValue(String(file?.key || file?.url || '')))
      .filter(Boolean);
  }

  if (Array.isArray(payload.urls) && payload.urls.length > 0) {
    return payload.urls.map((value: unknown) => extractObjectKeyFromValue(String(value || ''))).filter(Boolean);
  }

  return [];
};
