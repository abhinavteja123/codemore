import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://staging.example.com',
]);

// Good: allowlist check, not a wildcard.
export async function GET(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.has(origin);
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

// Good: wildcard origin but credentials disabled — legitimate public API.
export const publicCorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET'],
};

// Good: cors object without credentials at all.
export const noCredCorsOptions = {
  origin: '*',
  methods: ['GET', 'POST'],
};
