// TP fixture: anon branch reads all users; authed branch returns just self.
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

declare const supabase: {
  from: (t: string) => { select: () => Promise<{ data: unknown }> };
};

export async function GET() {
  const session = await auth();
  if (!session) {
    const { data } = await supabase.from('users').select();   // ← flag (anon → ALL)
    return NextResponse.json(data);
  }
  return NextResponse.json({ user: session.user });
}
