// True-positive fixture for vibe-ssrf-fetch-user-input.
// Each handler below fetches a URL sourced from user input. All must fire.

import { NextRequest, NextResponse } from 'next/server';

// Case 1: directly fetching from req.body.url
export async function POST_a(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(body.url);                       // ← flag
  return NextResponse.json({ ok: r.ok });
}

// Case 2: destructured tainted variable
export async function POST_b(req: NextRequest) {
  const { url } = await req.json();
  const r = await fetch(url);                            // ← flag
  return NextResponse.json({ ok: r.ok });
}

// Case 3: template-literal interpolation
export async function POST_c(req: NextRequest) {
  const { id } = await req.json();
  const r = await fetch(`https://api.example.com/items/${id}`);  // ← flag
  return NextResponse.json({ ok: r.ok });
}

// Case 4: axios.get with tainted argument
import axios from 'axios';
export async function POST_d(req: NextRequest) {
  const { target } = await req.json();
  const r = await axios.get(target);                     // ← flag
  return NextResponse.json({ data: r.data });
}

// Case 5: searchParams.get(...) flowing into fetch
export async function POST_e(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url') ?? '';
  const r = await fetch(target);                         // ← flag (via taint)
  return NextResponse.json({ ok: r.ok });
}
