import { NextResponse } from 'next/server';

// Pattern A: response headers set explicitly. Browser rejects this combo.
export async function GET() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

// Pattern B: cors() middleware object form with both fields.
export const corsOptions = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST'],
};
