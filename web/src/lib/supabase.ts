import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn("NEXT_PUBLIC_SUPABASE_URL not set — database features disabled");
}

// Server-side client with service role key (full access, bypasses RLS)
export const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export function isDbEnabled(): boolean {
  return supabase !== null;
}
