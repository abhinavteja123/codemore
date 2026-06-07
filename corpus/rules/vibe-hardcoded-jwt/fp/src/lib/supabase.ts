// False-positive fixture for vibe-hardcoded-jwt
// All JWT references here come from env vars, placeholder docs, or are
// short illustrative tokens. Rule MUST NOT flag any of them.

import { createClient } from '@supabase/supabase-js';

// Good: read from env.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, anonKey);

// Good: illustrative placeholder, not a real token (each segment under 12 chars).
const EXAMPLE_TOKEN = 'eyJhbGciOiJ.eyJzdWIiOiJ.signedHere';

// Good: comment describing the shape — not a literal in a value position
// that could be sent over the wire. The matcher still sees the string; we
// rely on the placeholder filter (short segments).
const DOC_LINE = 'eyJabc.eyJdef.zzz'; // tiny segments, treated as a placeholder

// Good: token explicitly redacted in the source.
const REDACTED = '<JWT_REDACTED_BY_SECURITY_REVIEW>';

// Good: not JWT-shape at all — random Stripe-style key.
const STRIPE = 'sk_live_51Nabcdef1234567890ghij';

export { EXAMPLE_TOKEN, DOC_LINE, REDACTED, STRIPE };
