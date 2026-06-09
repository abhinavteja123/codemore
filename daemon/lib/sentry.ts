/**
 * Sentry integration for daemon error tracking
 * Only initializes if SENTRY_DSN is configured
 */

import { createLogger, sanitizeError } from './logger';

const logger = createLogger('sentry');

let Sentry: typeof import("@sentry/node") | null = null;

export async function initSentry(): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    logger.info("No DSN configured, skipping initialization");
    return;
  }

  try {
    Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any) {
        // Never send user code content to Sentry
        if (event.extra) {
          delete event.extra.code;
          delete event.extra.fileContent;
          delete event.extra.apiKey;
        }
        return event;
      },
    });
    logger.info("Sentry initialized successfully");
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, "Failed to initialize Sentry");
  }
}

export function captureError(
  error: Error,
  context?: Record<string, unknown>
): void {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
): void {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
}
