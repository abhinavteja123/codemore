// True-positive fixture for vibe-secret-in-log.
// Each line below logs a value whose name strongly suggests a secret.

declare const logger: { info: (...a: unknown[]) => void };

export function logConfig(apiKey: string, accessToken: string, sessionId: string) {
  console.log('apiKey is', apiKey);                        // ← identifier
  console.error({ apiKey, accessToken });                  // ← object-shorthand
  logger.info(`token=${accessToken}`);                     // ← template substitution
  logger.info({ api_key: 'redacted-but-name-says-yes' });  // ← object-key with secret-name
  console.warn('using sessionId', sessionId);              // ← identifier sessionId
}

export function logCreds(serviceRoleKey: string, password: string) {
  console.log({ serviceRoleKey });                         // ← shorthand serviceRoleKey
  logger.info('password=' + password);                     // ← identifier password
}
