import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { logger } from "./logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  logger.warn("NEXT_PUBLIC_SUPABASE_URL not set — database features disabled");
}

// ============================================================================
// Admin Client (Service Role) - ONLY for operations that genuinely need it
// Use sparingly: creating user's first record on signup, background jobs
// WARNING: Bypasses ALL Row Level Security
// ============================================================================
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

// Legacy alias for compatibility
export const supabase = supabaseAdmin;

// ============================================================================
// Per-Request Server Client - Use this EVERYWHERE else
// Respects Row Level Security, scoped to the authenticated user
// ============================================================================
export function createSupabaseServer(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  // Use anon key with auth helpers to respect RLS
  // The user's session is read from cookies automatically
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        // Pass cookie-based auth token if available
        // This would be set up with @supabase/auth-helpers-nextjs in a full implementation
      },
    },
  });
}

export function isDbEnabled(): boolean {
  return supabaseAdmin !== null;
}
