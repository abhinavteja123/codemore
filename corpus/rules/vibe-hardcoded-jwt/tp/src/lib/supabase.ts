// True-positive fixture for vibe-hardcoded-jwt
// A realistic Moltbook-shape mistake: client-side Supabase client created with
// a hardcoded service-role JWT. Rule MUST flag both literal JWTs.

import { createClient } from '@supabase/supabase-js';

// BAD: hardcoded service-role JWT shipped to the client bundle.
const SUPABASE_URL = 'https://abcdef.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZiIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.UNIQUEsignaturebytes123456789abcdef';

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// BAD: a different hardcoded JWT used as an internal-service token.
export const INTERNAL_TOKEN =
  'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJpbnRlcm5hbC1zZXJ2aWNlIiwiaWF0IjoxNzMzMzMzMzMzfQ.signedbysomeRSAkeythatleakednowforever12345';
