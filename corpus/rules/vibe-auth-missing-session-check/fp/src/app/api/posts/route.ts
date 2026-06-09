// FP fixture (a): POST handler that calls auth() — rule must NOT fire.
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
  const body = await req.json();
  return NextResponse.json({ id: 'new-post', body });
}
