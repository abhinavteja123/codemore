# CodeMore benchmark — 50 AI-built public repos (2026-07)

Phase 6 study: scan 50 public repositories that are plausibly AI-built,
publish the aggregate numbers, and hand-triage the highest-reach rules
for true/false positives — including the embarrassing ones.

**Ethics.** Per [benchmark/README.md](README.md): this report contains
**aggregates only**. No repository name or URL ever appears next to a
specific finding. The target list (name, stars, stack, license,
selection signal) is public in [`targets.json`](targets.json); the
per-repo scan reports (`results/`) are gitignored and never published.
No live severe secret was found in any scanned repository (see
[Secrets](#secrets--what-the-blocker-hits-actually-were)).

## Methodology

- **Target selection** — 50 public GitHub repos chosen by "plausibly
  AI-built" signals, recorded per-target in `targets.json`:
  - **ai-builder** (35 repos): README self-describes as built with
    Lovable, Bolt.new, Cursor, v0, Claude Code, or "vibe coded".
  - **starter** (10 repos): recently created Next.js + Supabase apps
    matching the AI-starter profile.
  - **hackathon** (5 repos): recent hackathon projects.
- **Harness** — `scripts/benchmark.js`: sequential and resumable; each
  target is shallow-cloned to a temp dir, scanned, the JSON report
  written to `results/<n>.json`, and the clone deleted.
- **Scanner** — CodeMore `0.3.0` (local build, unpublished at scan
  time), default configuration (experimental rules off).
- **Aggregation** — `node scripts/benchmark-aggregate.js` joins
  `results/<n>.json` to `targets.json` by index and prints the numbers
  below. Rule impact is ranked by **repos affected**, not raw finding
  count, so one 2,468-finding repo cannot dominate.
- **Triage** — 7 rules were hand-triaged: the top-3 quality rules by
  repo-reach plus the 4 highest-impact security rules (the main
  BLOCKER drivers and `vibe-auth-missing-session-check`). Samples were
  spread across repos (max 2 findings per repo per rule); for the three
  BLOCKER security rules the *entire* finding population was triaged.
  Findings whose snippet/evidence was insufficient to judge were
  verified against the live code (3 targeted shallow clones + raw-file
  fetches, deleted after inspection). 133 findings were classified in
  total.

## Headline numbers

| Metric | Value |
|---|---|
| Repos scanned | 50 |
| Repos with ≥ 1 BLOCKER | 20 (40%) |
| …after discounting triaged-FP classes | 12 (24%) |
| Total findings | 8,330 |
| Findings per repo | min 0 · p25 4 · median 36 · p75 207 · p90 377 · max 2,468 |
| Repos with zero findings | 9 |
| Score (0–100) | min 25 · mean 76 · max 100 |
| Distinct rules fired | 41 |

Severity reach (repos with ≥ 1 finding at that severity):
BLOCKER 20 · CRITICAL 6 · MAJOR 41 · MINOR 32 · INFO 8.

The "after discounting" row is the honest one: triage (below) showed
that three BLOCKER rule classes were dominated by false positives in
this corpus; removing those classes, 12 of 50 repos still carry at
least one BLOCKER from rules we either triaged as true or that were
calibrated ≥ 85% precision in the [2026-06-12 audit](../accuracy-report-2026-06-12.md)
(path traversal, shell injection, `eval`, Supabase RLS, MCP config secrets).

### By selection-signal group

| Group | Repos | % with BLOCKER | Median findings | Mean score |
|---|---:|---:|---:|---:|
| starter | 10 | 30% | 78.5 | 71 |
| ai-builder | 35 | 37% | 26 | 80 |
| hackathon | 5 | 80% | 44 | 55 |

### Top rules by repos affected

| Rule | Severity | Repos | Findings |
|---|---|---:|---:|
| core-quality-unused-export | MAJOR | 24 | 2,342 |
| core-quality-cyclomatic-complexity | MAJOR | 23 | 683 |
| core-quality-leftover-console | MINOR | 20 | 1,093 |
| core-quality-unused-import | MAJOR | 19 | 324 |
| core-typescript-non-null-assertion-abuse | MINOR | 18 | 766 |
| core-quality-async-without-await | MINOR | 18 | 678 |
| core-quality-unused-variable | MAJOR | 16 | 35 |
| core-quality-empty-catch | MAJOR | 15 | 320 |
| core-typescript-as-any | MAJOR | 13 | 312 |
| vibe-auth-missing-session-check | MAJOR | 11 | 105 |

### What drove the BLOCKERs

| Rule | Repos | BLOCKER findings |
|---|---:|---:|
| vibe-xss-dangerously-set | 10 | 10 |
| core-security-innerhtml-assignment | 7 | 22 |
| core-security-path-traversal | 5 | 18 |
| core-security-hardcoded-secret-pattern | 3 | 28 |
| core-security-shell-injection | 3 | 8 |
| core-security-eval | 3 | 5 |
| vibe-supabase-rls-permissive | 3 | 77 |
| vibe-supabase-rls-disabled | 2 | 13 |
| vibe-mcp-config-secret | 1 | 2 |
| core-security-py-shell-injection | 1 | 1 |

## TP/FP triage

Hand-classified, one judgement per finding; "unclear" means the live
code left the verdict genuinely ambiguous and is excluded from the TP
rate. Where the snippet wasn't enough, the actual line was checked in
the live repository.

| Rule | Sampled | TP | FP | Unclear | TP rate | Dominant FP pattern |
|---|---:|---:|---:|---:|---:|---|
| core-quality-unused-export | 18 (6 clone-verified) | 16 | 0 | 2 | ~100%* | none found — but see note on scaffolded UI kits |
| core-quality-cyclomatic-complexity | 20 | 18 | 2 | 0 | 90% | vendored shadcn/ui `chart.tsx` counted like first-party code |
| core-quality-leftover-console | 18 | 14 | 4 | 0 | 78% | build scripts / GitHub Action workflow-command output where stdout **is** the interface |
| vibe-auth-missing-session-check | 17 (8 verified vs live code) | 6 | 9 | 2 | 40% | custom auth wrappers + intentionally-public endpoints (see below) |
| vibe-xss-dangerously-set | 10 (entire population) | 1 | 9 | 0 | 10% | vendored shadcn/ui `chart.tsx` ChartStyle; sanitized values not recognized |
| core-security-innerhtml-assignment | 22 (entire BLOCKER population) | 1 | 18 | 3 | ~5% | escape helpers not recognized; static template literals; bundled vendor files |
| core-security-hardcoded-secret-pattern | 28 (entire population) | 0 | 28 | 0 | 0%** | placeholder/fixture keys in test suites and docs |

\* Claim accuracy. Every clone-verified claim ("this export is not
imported by any other file") was true — on AI-scaffolded repos, whole
shadcn/ui component kits and type files genuinely go unconsumed, which
is why this rule alone produced 2,342 findings. This does **not**
overturn the ~30% precision measured on hand-written codebases in the
[2026-06-12 audit](../accuracy-report-2026-06-12.md) (where `import
type` tracking gaps dominate); it means the rule's precision is
corpus-dependent. The June guidance stands: `defaultConfidence: 0.7` so
agents sort it below security findings. Actionability caveat: most of
the volume is vendored UI-kit files where deletion is safe but the
developer may consider the kit intentional.

\** Corpus artifact, reported honestly: 27 of 28 matches came from two
repos that are themselves developer tools carrying *deliberate* fake
keys in test fixtures and example docs (`sk-proj-FAKE…`,
`ghp_abcdefgh…`, `AIzaSyExampl…`); the 28th was a PEM *header string
quoted in tutorial prose* with no key material present (verified
against the live file). The same rule scored 100% precision on
application repos in the June audit — real apps don't carry fixture
keys, security tools do. Follow-up below.

### Verified true positives worth naming (as patterns, not repos)

- A chat app rendering LLM output through `marked.parse()` with **no
  sanitizer** into `dangerouslySetInnerHTML` — prompt-injection → XSS
  in an Electron renderer. The one XSS TP, and a serious one.
- Unauthenticated Next.js API routes proxying paid LLM APIs (quota
  theft) and unauthenticated POST/DELETE routes mutating shared data —
  6 confirmed across 4 repos, none protected by middleware (verified).
- API route handlers with cyclomatic complexity 86, 58, 52 and 51 —
  single functions handling webhook parsing, retries and side effects.

## Rules above 30% FP in this sample — documented follow-ups

Per the contribution gate, each needs a fixture pair + validator green
+ `ruleVersion` bump; none were tightened in this pass because none of
the fixes is a one-liner.

1. **`vibe-xss-dangerously-set` (90% FP).** 6 of 10 findings were the
   identical vendored shadcn/ui `chart.tsx` ChartStyle block —
   `dangerouslySetInnerHTML` fed by `Object.entries(THEMES).map(…)`
   over a module-scope constant. Fixes: (a) treat values derived only
   from module-scope constants as static; (b) recognize
   `DOMPurify.sanitize(…)` / `sanitizeHtml(…)` wrapping the value and
   downgrade (one verified FP escaped entities *and* ran DOMPurify with
   an allowlist, yet still drew a BLOCKER); (c) treat
   `JSON.stringify(…)`-only interpolation (JSON-LD blocks, theme
   scripts) as safe-by-construction.
2. **`core-security-innerhtml-assignment` (~95% FP at BLOCKER).**
   Patterns: (a) template literals whose every interpolation passes
   through an `escapeHtml`-style helper still classify as "dynamic";
   (b) ternaries/concatenations of string literals classify as
   dynamic; (c) minified vendor bundles (`*.min.js`, committed
   `public/` build artifacts) are scanned like first-party code;
   (d) the detached-element parsing idiom (`createElement` →
   `innerHTML` → read-only walk) is not a render sink.
3. **`vibe-auth-missing-session-check` (60% FP).** Patterns: (a) the
   auth-helper allowlist misses compositional wrappers from workspace
   packages — one verified route was wrapped in
   `withAuth(withAgentSignature(handler))` and still flagged;
   (b) endpoints whose *contract* is anonymous (API-key validation
   endpoints, captcha scoring, setup routes guarded by
   `NODE_ENV === 'production'` early-return); (c) routes whose auth is
   the caller-supplied credential itself (a personal access token in
   the request body, validated and forwarded); (d) desktop/local-only
   apps (Electron) where HTTP routes never face the internet.
4. **`core-security-hardcoded-secret-pattern` (0% TP in this corpus).**
   Needs a placeholder heuristic (case-insensitive
   `fake|example|test|placeholder`, `abcd…`/`1234…` runs) plus a
   test-fixture path downweight (`tests/`, `*.test.*`, `examples/`) —
   downgrade those to a "fixture-shaped secret" MINOR instead of
   BLOCKER, keeping BLOCKER for production paths. Bonus label bug
   found: real Anthropic keys (`sk-ant-api03-…`) don't match the
   Anthropic pattern (`sk-ant-(?:api|admin)-…`) and fall through to
   the generic OpenAI `sk-…` pattern — detected, but attributed to the
   wrong provider.

`core-quality-leftover-console` (22% FP) sits under the bar but has a
cheap known fix: extend the June Python diagnostic-script exemption to
JS build scripts (`scripts/**`, `*.mjs` build files) and GitHub Action
sources emitting workflow commands (`::set-output`, `::warning`).

## Secrets — what the BLOCKER hits actually were

All 28 `hardcoded-secret-pattern` findings were triaged individually:
every one was a deliberate test fixture, a documentation example, or a
PEM header quoted in prose. **No live credential was found in any
scanned repository.** Had one been found in a repo with apparent real
users, per the benchmark ethics it would have been reported privately
and never published.

## Limitations

The scanner's own documented limits ([docs/limitations.md](../docs/limitations.md)) apply to
every number above:

- CodeMore holds itself to **agent-actionable findings only** — classes
  needing human judgement, runtime observation, or external state
  (business-logic flaws, race conditions, open buckets, MFA/password
  policy, DAST-only classes, live secret rotation) are deliberately out
  of scope, so this benchmark says nothing about them.
- Rules known to sit **below the 75% precision bar** are documented in
  limitations.md (`core-quality-unused-export` ~30% on hand-written
  code, `vibe-supply-chain-hallucinated-import` ~25%,
  `vibe-agent-tool-no-confirm` ~50%) and carry lowered confidence so
  agents down-rank them.
- Study-specific limits: single scan per repo (no re-scan after fixes);
  triage was single-rater; the seven triaged rules cover the top of the
  reach/severity distribution, not all 41 rules that fired; selection
  signals ("README says built with X") are self-reported by repo
  authors; the corpus skews small (median 36 findings/repo,
  smallest-first target ordering).

## Reproducing

```bash
node scripts/benchmark.js          # sequential, resumable; clones are temp + deleted
node scripts/benchmark-aggregate.js
```

`results/` stays gitignored. If you re-run this against the same
targets you accept the same ethics rules in [README.md](README.md).
