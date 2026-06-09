// FP (c): POST that returns a static payload without reading any user
// input. No req.json() / req.body / req.query reference — rule stays silent.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ ping: 'pong' });
}
