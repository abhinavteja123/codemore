export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      enabled: !!process.env.SENTRY_DSN,
      beforeSend(event) {
        // Strip sensitive data before sending
        if (event.request?.cookies) delete event.request.cookies;
        if (event.user) event.user = { id: event.user.id };
        return event;
      },
    });
  }
}
