// FP fixture (b): GET-only route — rule does not flag read-only handlers.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
