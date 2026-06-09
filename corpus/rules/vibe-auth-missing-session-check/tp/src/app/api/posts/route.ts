// True-positive fixture: state-changing route, no auth helper anywhere.
// Rule MUST fire.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Imagine a DB write here. No session check.
  return NextResponse.json({ id: 'new-post', body });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  return NextResponse.json({ deleted: id });
}
