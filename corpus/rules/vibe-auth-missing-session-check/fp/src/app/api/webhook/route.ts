// FP fixture (c): POST handler that imports a recognised auth library
// (here Clerk). Even though it doesn't actually call auth(), the import
// signal is enough — the team has wired sessions somewhere.
//
// (We accept the false negative on "imports Clerk but forgot to call it"
// in v1; the alternative is too noisy. Lifted later when we add
// middleware.ts inspection.)
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { userId } = await clerkAuth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const body = await req.json();
  return NextResponse.json({ id: 'wh-1', body });
}
