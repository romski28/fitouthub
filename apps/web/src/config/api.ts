const isLocalHost = (host: string) => ['localhost', '127.0.0.1'].includes(host.toLowerCase());

const ensureApiSuffix = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, '');
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
};

export const API_BASE_URL = (() => {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (env && env.length > 0) return ensureApiSuffix(env);
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return 'http://localhost:3001/api';
  }
  return 'https://fitouthub.onrender.com/api';
})();
