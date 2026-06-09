// TP fixture: createClient called with a hardcoded JWT in src/components.
// Rule must fire.

import { createClient } from '@supabase/supabase-js';

// codemore-ignore-next-line: vibe-hardcoded-jwt
// (We intentionally include the JWT-shaped literal here for this rule's
//  fixture; the vibe-hardcoded-jwt rule would otherwise also fire on the
//  same line. Suppressed so the TP for THIS rule isn't double-flagged.)
export const supabase = createClient(
  'https://example.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.fake-signature-for-test',
);
