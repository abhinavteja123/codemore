// False-positive fixture: Next.js App Router POST handler. Even though
// this file itself doesn't call the limiter (assume a middleware does it),
// the project HAS @upstash/ratelimit imported via lib/ratelimit.ts. The
// rule's project-level signal flips to true and we must NOT fire here.

import { NextRequest, NextResponse } from 'next/server';
import { limiter } from '../../../lib/ratelimit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anon';
  const { success } = await limiter.limit(ip);
  if (!success) return new NextResponse('Too Many Requests', { status: 429 });
  const body = await req.json();
  return NextResponse.json({ id: 'msg-1', body });
}
