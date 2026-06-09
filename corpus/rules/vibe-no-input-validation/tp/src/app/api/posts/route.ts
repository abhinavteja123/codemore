// TP fixture: POST handler that reads req.json() with no schema validation.
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Use body.title directly — no Zod, no joi, no parsing of any kind.
  return NextResponse.json({ id: 'new-post', title: body.title });
}
