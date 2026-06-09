// False-positive fixture for vibe-ssrf-fetch-user-input.
// Each handler below uses a static or allowlisted URL. None must fire.

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Case 1: static URL literal — safe.
export async function GET_a() {
  const r = await fetch('https://api.example.com/health');
  return NextResponse.json({ ok: r.ok });
}

// Case 2: no-substitution template literal — static, safe.
export async function GET_b() {
  const r = await fetch(`https://api.example.com/health`);
  return NextResponse.json({ ok: r.ok });
}

// Case 3: axios.get against a hard-coded URL.
export async function GET_c() {
  const r = await axios.get('https://api.github.com/zen');
  return NextResponse.json({ data: r.data });
}

// Case 4: URL is built from env vars (rule treats env as non-user input).
const SERVICE_HOST = process.env.SERVICE_HOST ?? 'localhost';
export async function GET_d() {
  const r = await fetch(`${SERVICE_HOST}/internal`);
  // Template-with-interpolation: this is a known false-negative direction
  // we deliberately don't flag, since env-driven URLs are common in real
  // apps. If the user actually wants to flag this, they can use the
  // hardcoded-secret rule or codemorerc severity overrides.
  return NextResponse.json({ ok: r.ok });
}

// Case 5: tainted value RE-ASSIGNED to a sanitised value before fetch.
// We deliberately don't track sanitiser calls in v1, but the fact that
// `safe` is not directly tainted (it's a function call result) keeps
// us silent.
function allowlistedUrl(u: string): string {
  const target = new URL(u);
  if (target.host !== 'api.example.com') throw new Error('bad host');
  return target.toString();
}
export async function POST_e(req: NextRequest) {
  const body = await req.json();
  const safe = allowlistedUrl(body.url);
  const r = await fetch(safe);
  return NextResponse.json({ ok: r.ok });
}
