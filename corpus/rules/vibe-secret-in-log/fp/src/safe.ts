// FP fixture for vibe-secret-in-log.

declare const logger: { info: (...a: unknown[]) => void };
declare function redact<T>(v: T): T;
declare function mask(s: string): string;
declare function sanitize<T>(v: T): T;

export function logSafeStrings() {
  console.log('hello world');                         // no secret-name
  console.error('error', { user: 'alice' });          // no secret-name
  logger.info({ count: 42, name: 'demo' });           // benign keys
}

export function logRedacted(apiKey: string, accessToken: string) {
  console.log({ apiKey: redact(apiKey) });            // redacted — silent
  logger.info('token=' + mask(accessToken));          // mask() wrapping
  console.warn(sanitize({ accessToken }));            // sanitize call wraps
}

// Non-logger calls that mention secret names are NOT flagged.
export function useApiKey(apiKey: string): string {
  return `Bearer ${apiKey}`;                          // no logger involved
}
