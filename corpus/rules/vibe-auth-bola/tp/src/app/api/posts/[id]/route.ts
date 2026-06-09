// True-positive fixture: dynamic [id] route. Auth is checked. But the
// DB query uses params.id without scoping by session.user.id.
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// Pretend Prisma client.
declare const prisma: {
  post: {
    findUnique: (a: { where: { id: string } }) => Promise<unknown>;
    update: (a: { where: { id: string }; data: unknown }) => Promise<unknown>;
  };
};

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  // BOLA: lookup by id only; any logged-in user can pass any post id.
  const post = await prisma.post.findUnique({ where: { id: ctx.params.id } });
  return NextResponse.json(post);
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json();
  const updated = await prisma.post.update({
    where: { id: ctx.params.id },          // ← still no userId
    data: body,
  });
  return NextResponse.json(updated);
}
