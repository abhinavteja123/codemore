// FP (a): properly scoped — query filters by both id AND session user id.
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

declare const prisma: {
  post: {
    findUnique: (a: { where: { id: string; userId: string } }) => Promise<unknown>;
    update: (a: { where: { id: string; userId: string }; data: unknown }) => Promise<unknown>;
  };
};

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  // Scoped query — ownership term present in this function body.
  const post = await prisma.post.findUnique({
    where: { id: ctx.params.id, userId: session.user.id },
  });
  return NextResponse.json(post);
}
