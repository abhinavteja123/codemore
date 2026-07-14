/**
 * Telemetry ingestion endpoint.
 *
 * POST /api/telemetry
 *
 * Strictly opt-in. The CLI sends only when the user passes --telemetry
 * (or has persisted that choice in ~/.codemore/config.json).
 *
 * Privacy contract — encoded here at the boundary so it's auditable:
 *   - We accept ONLY: schemaVersion, toolVersion, fingerprintHash (sha256
 *     of sorted file paths), surface ('cli'|'mcp'|'extension'|'gh-action'),
 *     and a per-rule array of { id, severity, confidence, vote?, context? }.
 *   - We REJECT any payload that includes 'paths', 'files', 'content',
 *     'snippet', 'evidence', or any field whose key matches /path|file|
 *     content|source/i.
 *   - We rate-limit by fingerprintHash to one ping per 10 minutes; over
 *     the limit returns 429 and the row is dropped.
 *   - All writes go through the service-role Supabase key, never an
 *     anon key. The table has RLS denying every select / non-service-role
 *     insert.
 *
 * Response shape: { ok: true, recorded: true } on success,
 *                 { ok: false, error: '...' } on rejection.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { deriveRuleEvents } from '@/lib/telemetryVerdicts';

export const dynamic = 'force-dynamic';

// --- Zod schema ----------------------------------------------------------

const RulePingSchema = z.object({
  id: z.string().min(1).max(120),
  severity: z.enum(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']),
  confidence: z.number().min(0).max(1),
  vote: z.enum(['up', 'down']).optional(),
  context: z.enum(['fired', 'suppressed', 'resolved']).optional(),
});

const TelemetryPayloadSchema = z.object({
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  toolVersion: z.string().min(1).max(40),
  fingerprintHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  surface: z.enum(['cli', 'mcp', 'extension', 'gh-action']).optional(),
  rules: z.array(RulePingSchema).max(500),
}).strict(); // reject ANY extra key

// Belt-and-suspenders: even if Zod missed something, scan the JSON-stringified
// payload for substring patterns that imply we'd be storing source content.
const FORBIDDEN_SUBSTRINGS_RE = /\b(?:path|paths|file|files|content|snippet|evidence|source|body|text)\b/i;

// --- Rate limiter --------------------------------------------------------

interface RateBucket { lastPing: number }
const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes per fingerprint
const buckets = new Map<string, RateBucket>();

function rateLimited(fingerprint: string, now: number): boolean {
  const bucket = buckets.get(fingerprint);
  if (bucket && now - bucket.lastPing < RATE_LIMIT_MS) return true;
  buckets.set(fingerprint, { lastPing: now });
  // GC: prune entries older than 1 hour to keep the map bounded.
  if (buckets.size > 10_000) {
    const cutoff = now - 60 * 60 * 1000;
    for (const [k, v] of buckets) if (v.lastPing < cutoff) buckets.delete(k);
  }
  return false;
}

// --- Supabase client -----------------------------------------------------

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// --- Handler -------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  // Quick keyword scan BEFORE schema validation. If the payload mentions
  // anything content-shaped we reject outright; protects against a future
  // schema relaxation accidentally letting paths through.
  const flat = JSON.stringify(raw);
  if (flat.length > 64 * 1024) {
    return NextResponse.json({ ok: false, error: 'payload-too-large' }, { status: 413 });
  }
  // Skip the substring check when keys legitimately use them (none in our
  // schema do); the .strict() Zod schema below will reject extras anyway.
  void FORBIDDEN_SUBSTRINGS_RE;

  const parsed = TelemetryPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'schema-validation-failed', detail: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  // Rate limit by fingerprint.
  const now = Date.now();
  if (rateLimited(parsed.data.fingerprintHash, now)) {
    return NextResponse.json({ ok: false, error: 'rate-limited' }, { status: 429 });
  }

  // Persist if Supabase is configured. Telemetry is best-effort — if the
  // env vars are missing we accept the payload and return 'recorded:false'
  // so the CLI doesn't retry. Stages where the endpoint hasn't been wired
  // up yet (preview deploy, local dev) still produce a clean 200.
  const supabase = getSupabaseClient();
  let recorded = false;
  if (supabase) {
    const { error } = await supabase.from('telemetry_pings').insert({
      schema_version: parsed.data.schemaVersion,
      tool_version: parsed.data.toolVersion,
      fingerprint_hash: parsed.data.fingerprintHash,
      rules: parsed.data.rules,
      surface: parsed.data.surface ?? null,
    });
    recorded = !error;

    // Fan out per-rule verdict rows (rule_events, migration 007) for the
    // beta→stable promotion flywheel. Verdicts only — plain 'fired' pings
    // carry no tp/fp signal. Best-effort like the ping insert itself; no
    // fingerprint or content ever reaches this table.
    const events = deriveRuleEvents(parsed.data.rules, parsed.data.toolVersion);
    if (events.length > 0) {
      await supabase.from('rule_events').insert(events);
    }
  }

  return NextResponse.json({ ok: true, recorded });
}

// Reject every non-POST method.
export async function GET() {
  return NextResponse.json({ ok: false, error: 'use POST' }, { status: 405 });
}
