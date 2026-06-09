// FP (b): no auth check at all — vibe-auth-missing-session-check covers
// this; vibe-auth-bola must NOT fire (we require an auth check for BOLA).
import { NextResponse } from 'next/server';

declare const prisma: {
  page: { findUnique: (a: { where: { slug: string } }) => Promise<unknown> };
};

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  // Public page lookup; intentionally no session check.
  const page = await prisma.page.findUnique({ where: { slug: ctx.params.slug } });
  return NextResponse.json(page);
}
