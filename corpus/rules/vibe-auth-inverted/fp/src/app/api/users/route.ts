// FP fixture (correct shape): anon → 401, authed → the user's record.
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });    // anon → narrower
  }
  return NextResponse.json({ user: session.user });
}
