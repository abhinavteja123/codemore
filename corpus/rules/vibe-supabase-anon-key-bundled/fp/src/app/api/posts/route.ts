// FP (b): server-only route (app/api/.../route.ts) is not client-reachable.
// Even a hardcoded service-role key here doesn't ship to the browser
// (a separate rule could still flag the hardcoded secret, but this rule
// is specifically about client-bundle leakage).
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  'https://example.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const { data } = await client.from('posts').select();
  return Response.json(data);
}
