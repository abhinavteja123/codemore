/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Web dashboard — Phase 3 plan demotes this to a 'scan-by-URL' demo. The
   page-level empty catches are part of the legacy dashboard slated for
   replacement; rules will re-apply per-component after the rewrite. */

// instrumentation.ts - Optional Sentry integration
// This file runs at startup and initializes optional monitoring

export async function register() {
  // Sentry integration is optional - only loads if DSN is set
  // Skip entirely if SENTRY_DSN is not configured
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    try {
      // Dynamic import to avoid compile-time errors when @sentry/nextjs isn't installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require("@sentry/nextjs");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
        enabled: true,
        beforeSend(event: Record<string, unknown>) {
          // Strip sensitive data before sending
          const req = event.request as { cookies?: unknown } | undefined;
          if (req?.cookies) delete req.cookies;
          const user = event.user as { id?: string } | undefined;
          if (user) event.user = { id: user.id };
          return event;
        },
      });
    } catch {
      // @sentry/nextjs not installed - monitoring disabled
    }
  }
}
