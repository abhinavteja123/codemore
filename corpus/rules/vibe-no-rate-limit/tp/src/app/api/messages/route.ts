// True-positive fixture: Next.js App Router POST handler. No rate limit
// anywhere in the project. Rule must fire on this file.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Persist a message somewhere. No rate limiting.
  return NextResponse.json({ id: 'msg-1', body });
}

export async function GET() {
  return NextResponse.json({ items: [] });
}
