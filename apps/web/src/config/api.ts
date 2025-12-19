const isLocalHost = (host: string) => ['localhost', '127.0.0.1'].includes(host.toLowerCase());

export const API_BASE_URL = (() => {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (env && env.length > 0) return env;
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return 'http://localhost:3001/api';
  }
  return 'https://fitouthub.onrender.com/api';
})();
