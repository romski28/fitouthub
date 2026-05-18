const EMERGENCY_PHOTO_STORAGE_PREFIX = 'emergency-photo-urls:';

const buildStorageKey = (token: string) => `${EMERGENCY_PHOTO_STORAGE_PREFIX}${token}`;

const createStorageToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export function storeEmergencyPhotoUrls(photoUrls: string[]): string | null {
  if (typeof window === 'undefined' || photoUrls.length === 0) return null;

  const token = createStorageToken();
  try {
    window.sessionStorage.setItem(buildStorageKey(token), JSON.stringify(photoUrls));
    return token;
  } catch {
    return null;
  }
}

export function readEmergencyPhotoUrls(token?: string | null): string[] {
  if (typeof window === 'undefined' || !token) return [];

  try {
    const raw = window.sessionStorage.getItem(buildStorageKey(token));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function clearEmergencyPhotoUrls(token?: string | null) {
  if (typeof window === 'undefined' || !token) return;
  try {
    window.sessionStorage.removeItem(buildStorageKey(token));
  } catch {
    // no-op
  }
}