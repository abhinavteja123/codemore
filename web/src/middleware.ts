import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ============================================================================
// In-Memory Rate Limiter (fallback when Upstash Redis is not configured)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private cache = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async limit(identifier: string): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }> {
    const now = Date.now();
    const entry = this.cache.get(identifier);

    if (!entry || now >= entry.resetAt) {
      // New window
      const resetAt = now + this.windowMs;
      this.cache.set(identifier, { count: 1, resetAt });
      return {
        success: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        reset: resetAt,
      };
    }

    // Existing window
    entry.count++;
    const remaining = Math.max(0, this.maxRequests - entry.count);
    const success = entry.count <= this.maxRequests;

    return {
      success,
      limit: this.maxRequests,
      remaining,
      reset: entry.resetAt,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now >= entry.resetAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Standard rate limit: 100 requests per 60 seconds (increased for local dev)
const standardLimiter = new InMemoryRateLimiter(60000, 100);

// Stricter limit for expensive AI/scan routes: 20 requests per 60 seconds
const scanLimiter = new InMemoryRateLimiter(60000, 20);

// ============================================================================
// Middleware
// ============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip rate limiting for non-API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Skip rate limiting for health checks
  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  // Use authenticated user ID if available, fall back to IP
  const token = await getToken({ req: request });
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
  const identifier = token?.sub ?? ip;

  // Stricter limits for scan and AI routes
  const isExpensiveRoute = pathname.includes('/scan') || pathname.includes('/ai');
  const limiter = isExpensiveRoute ? scanLimiter : standardLimiter;

  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before retrying.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
