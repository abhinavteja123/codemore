import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";

/**
 * CSRF Protection via Origin header validation
 *
 * Validates that POST/DELETE/PATCH requests come from the same origin.
 * This prevents malicious sites from triggering state-changing actions
 * on behalf of logged-in users.
 *
 * @returns null if valid, NextResponse with 403 if invalid
 */
export function validateCsrf(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // For GET/HEAD/OPTIONS requests, skip CSRF check
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  if (!origin) {
    return NextResponse.json(
      { error: "Missing origin header" },
      { status: 403 }
    );
  }

  if (!host) {
    return NextResponse.json(
      { error: "Missing host header" },
      { status: 403 }
    );
  }

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      logger.warn({ originHost, host }, "CSRF origin mismatch");
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid origin format" },
      { status: 403 }
    );
  }

  return null; // null means OK, proceed
}

/**
 * Helper to wrap an API route handler with CSRF protection
 *
 * Usage:
 * ```ts
 * export const POST = withCsrfProtection(async (req) => {
 *   // Your handler logic
 * });
 * ```
 */
export function withCsrfProtection(
  handler: (req: NextRequest) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const csrfError = validateCsrf(req);
    if (csrfError) return csrfError;
    return handler(req);
  };
}
