-- Migration 005 — Telemetry pings.
--
-- Opt-in only (the CLI never sends without --telemetry). Path content
-- is hashed before transmission; we never store source code. This
-- table powers the auto-demote bot that nightly inspects per-rule
-- downvote rates and opens PRs to demote any stable rule whose FP
-- rate crosses 10% over a 14-day window.

create table if not exists telemetry_pings (
  id              uuid primary key default gen_random_uuid(),
  received_at     timestamptz not null default now(),
  schema_version  text not null,
  tool_version    text not null,
  -- Opaque project fingerprint (sha256 of sorted file paths). Lets us
  -- deduplicate without ever knowing which project it was.
  fingerprint_hash text not null,
  -- Per-rule entries: { id, severity, confidence, vote?, context? }.
  rules           jsonb not null,
  -- Optional surface hint: 'cli' | 'mcp' | 'extension' | 'gh-action'.
  surface         text
);

-- Index for the auto-demote bot's per-rule aggregate query.
create index if not exists telemetry_pings_received_idx
  on telemetry_pings (received_at desc);
create index if not exists telemetry_pings_fingerprint_idx
  on telemetry_pings (fingerprint_hash, received_at desc);

-- RLS: ingest-only. The Vercel function uses the service-role key to
-- insert. Nobody else can read or write.
alter table telemetry_pings enable row level security;

-- Explicit policy: no rows readable by anon / authenticated. The
-- aggregate view (`telemetry_pings_aggregate`) below is what humans
-- consume.
create policy "telemetry: deny all anon reads"
  on telemetry_pings
  for select
  using (false);

create policy "telemetry: deny all writes from non-service-role"
  on telemetry_pings
  for insert
  with check (false);

-- Aggregate view — exposes ONLY per-rule counts + vote ratios; never
-- individual fingerprints. Used by the auto-demote bot.
create or replace view telemetry_pings_aggregate as
select
  r->>'id'                                       as rule_id,
  count(*)                                       as ping_count,
  sum(case when r->>'vote' = 'up'   then 1 else 0 end) as votes_up,
  sum(case when r->>'vote' = 'down' then 1 else 0 end) as votes_down,
  date_trunc('day', received_at)::date           as day
from telemetry_pings t
cross join jsonb_array_elements(t.rules) as r
group by 1, 4;

comment on table telemetry_pings is
  'Opt-in usage telemetry. Receives one row per `codemore scan --telemetry` ' ||
  'invocation. Paths are hashed before transmission; no source content is stored.';
