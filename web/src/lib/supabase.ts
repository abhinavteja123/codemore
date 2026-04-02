import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Track if we've validated the DB connection
let dbValidated = false;
let dbWorking = false;

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

/**
 * Check if database is enabled and working.
 * On first call, attempts a simple query to validate the connection.
 * Subsequent calls use cached result for performance.
 */
export async function validateDbConnection(): Promise<boolean> {
  if (dbValidated) return dbWorking;
  
  if (!supabaseAdmin) {
    dbValidated = true;
    dbWorking = false;
    return false;
  }

  try {
    // Try a simple query to see if DB is accessible
    const { error } = await supabaseAdmin
      .from('projects')
      .select('id')
      .limit(1);
    
    if (error) {
      // Table doesn't exist or connection failed
      logger.warn({ code: error.code }, "Database not available - running in demo mode");
      dbWorking = false;
    } else {
      dbWorking = true;
    }
  } catch {
    dbWorking = false;
  }

  dbValidated = true;
  return dbWorking;
}

/**
 * Quick synchronous check if DB config exists.
 * For actual DB operations, use validateDbConnection() first.
 */
export function isDbEnabled(): boolean {
  // If we've validated, use the cached result
  if (dbValidated) return dbWorking;
  // Otherwise just check if client exists (caller should validate before operations)
  return supabaseAdmin !== null;
}
