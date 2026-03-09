const DEFAULT_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryOnStatuses?: Set<number>;
  retryMethods?: string[];
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchRetryOptions,
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 300;
  const retryOnStatuses = options?.retryOnStatuses ?? DEFAULT_RETRYABLE_STATUSES;
  const retryMethods = (options?.retryMethods ?? ['GET', 'HEAD', 'OPTIONS']).map((method) => method.toUpperCase());
  const method = (init?.method || 'GET').toUpperCase();
  const canRetry = retryMethods.includes(method);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(input, init);

      if (!canRetry || !retryOnStatuses.has(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      lastError = error;

      if (!canRetry || attempt === maxAttempts) {
        throw error;
      }
    }

    await sleep(baseDelayMs * Math.pow(2, attempt - 1));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Request failed after retries');
}