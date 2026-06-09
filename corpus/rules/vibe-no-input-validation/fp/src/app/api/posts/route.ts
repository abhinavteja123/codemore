// FP (a): file imports zod — rule treats import as evidence of intent.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const Body = z.object({ title: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new NextResponse('Bad input', { status: 400 });
  return NextResponse.json({ id: 'new-post', title: parsed.data.title });
}
