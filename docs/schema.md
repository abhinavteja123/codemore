# CodeMore Report Schema — v1.0.0

**Last Updated:** 2026-07-10

The **`codemore-report.json`** contract is the API. Every CodeMore surface
(CLI, MCP server, VS Code extension, GitHub Action, web scanner) emits
identical byte-aligned reports. The schema is stable: breaking changes bump
`schemaVersion` major and ship a migration guide.

## Quick start

```bash
npx codemore scan . --json > report.json
```

Need SARIF instead (GitHub code scanning)? `npx codemore scan . --format sarif --out codemore.sarif`.

Pipe to your agent. Every rule finding includes file location, severity,
confidence, fix template, and verification criteria — everything an LLM
needs to close the loop.

---

## Top-level structure

```jsonc
{
  "schemaVersion":     "1.0.0",           // Semver. Major = breaking change.
  "scannedAt":         "2026-06-12T...",  // ISO-8601 timestamp of scan start.
  "tool":              { "name": "codemore", "version": "0.2.7" },
  "project":           { "root": ".", "framework": "next.js", "language": "typescript" },
  "summary":           { /* counts + aggregations */ },
  "issues":            [ /* array of findings */ ],
  "agentInstructions": { "preamble": "You are fixing issues found by CodeMore...", … },  // optional
  "meta":              { "rulesEnabled": 64, "packsLoaded": […], "scanDurationMs": 4321 }  // optional
}
```

**Required fields (must always be present):**
- `schemaVersion` — string, semver format. Agents should reject unknown major versions.
- `scannedAt` — ISO-8601 timestamp. Use this to avoid processing stale reports.
- `tool` — object with `name: "codemore"` and `version`.
- `project` — object with `root` (path), and optional `framework`, `language`, `fingerprint`.
- `summary` — aggregated statistics across all findings.
- `issues` — array of `Issue` objects.

---

## Summary object

```jsonc
{
  "score": 42,                      // 0–100 quality score (higher is better).
  "issuesTotal": 18,                // Total count across all severities.
  "bySeverity": {
    "BLOCKER":  2,
    "CRITICAL": 3,
    "MAJOR":    8,
    "MINOR":    5,
    "INFO":     0
  },
  "byCategory": {
    "security":      5,
    "bug":           8,
    "code-smell":    2,
    "performance":   3
  },
  "filesAnalyzed":        87,
  "linesOfCode":          12450,
  "technicalDebtMinutes": 240
}
```

**Required fields:**
- `score` — 0–100. Higher is better. Per-file average, then **capped by the worst severity present**: any BLOCKER caps the score at 59 (−3 per additional BLOCKER, floor 25); otherwise any CRITICAL caps it at 79 (−2 each, floor 45). A codebase with a live BLOCKER can never read "healthy". Logic: `shared/scoring.ts`.
- `issuesTotal` — Total across all severities.
- `bySeverity` — Counts for each severity: `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`.
- `byCategory` — Per-category counts. Categories: `bug`, `code-smell`, `performance`, `security`, `maintainability`, `accessibility`, `best-practice`.
- `filesAnalyzed` — Number of source files examined.
- `linesOfCode` — Total lines analyzed.
- `technicalDebtMinutes` — Estimated fix effort across all findings (agents use this for prioritization).

---

## Severity levels

| Level | Meaning | Example |
|---|---|---|
| **BLOCKER** | Shipping this code risks immediate data loss, credential leak, or critical service outage. Fix before deploying. | Supabase RLS disabled, hardcoded AWS secret, SQL injection via unescaped concat |
| **CRITICAL** | High-risk, likely exploitable vulnerability or severe reliability bug. Fix in current sprint. | Weak crypto, missing session validation, unvalidated file upload |
| **MAJOR** | Moderate correctness or security issue. Fix in next sprint. | Unused variable that hides logic bug, async-without-await, dead code path |
| **MINOR** | Low-risk or style issue. Reduce technical debt over time. | Leftover `console.log`, missing JSDoc, cyclomatic complexity > threshold |
| **INFO** | Informational only. No action required, but useful context for refactoring. | Import that will break on a future major version bump |

Agents should prioritize by severity: **blockers → criticals → majors → minors → infos**.

---

## Issue object

Each finding has this shape:

```jsonc
{
  "id":             "vibe-supabase-rls-disabled",
  "ruleVersion":    "1.2.0",
  "instanceId":     "01HZ9KGZQ7HBGF1XYZP2C3K4Q5",    // unique per instance, ULID
  "lifecycle":      "beta",
  "severity":       "BLOCKER",
  "confidence":     0.95,                             // 0.0 to 1.0
  "category":       "security",
  "title":          "Supabase table has no RLS policy",
  "evidence": {
    "file":            "supabase/migrations/001_init.sql",
    "line":            14,
    "column":          1,
    "endLine":         14,
    "endColumn":       60,
    "snippet":         "create table profiles (id uuid primary key, …);",
    "matchedPattern":  "create-table-without-rls"
  },
  "whyItMatters":   "Public Supabase client can read/write all rows. 70% of Lovable apps leak data through this.",
  "citation":       "https://codemore.tech/rules/vibe-supabase-rls-disabled",
  "suggestedFix": {
    "type":                 "code-patch",
    "instructions":         "Add `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;` plus at least one policy scoped to authenticated users.",
    "patchTemplate":        "…",  // optional unified-diff template
    "verificationCriteria": [      // optional; agent runs these after applying fix
      "Migration contains ALTER TABLE … ENABLE ROW LEVEL SECURITY",
      "At least one CREATE POLICY exists for the table",
      "Re-scan no longer reports vibe-supabase-rls-disabled for this file"
    ]
  },
  "suppression": {
    "available": true,
    "directive": "// codemore-ignore: vibe-supabase-rls-disabled",
    "scope":     "same-line | next-line | file"
  },
  "baselineStatus": "new"  // optional; only present when scan run with --baseline
}
```

**Required fields:**
- `id` — Stable rule identifier (kebab-case, e.g. `vibe-supabase-rls-disabled`). External-tool findings are namespaced: `ext:ruff:F401`.
- `ruleVersion` — Semver of the rule module. Use for pinning specific versions.
- `instanceId` — Unique identifier per finding (ULID/UUID). Used for feedback loops and `validate_fix` calls.
- `severity` — One of `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`.
- `confidence` — 0.0 to 1.0. Anything < 0.6 is experimental-grade (agent should downweight).
- `category` — One of: `bug`, `code-smell`, `performance`, `security`, `maintainability`, `accessibility`, `best-practice`.
- `title` — One-line headline of the issue.
- `evidence` — Location and snippet (see below).
- `whyItMatters` — One-paragraph explanation an LLM uses as fix context.
- `citation` — URL to the rule's docs page.

**Optional fields:**
- `lifecycle` — One of `experimental`, `beta`, `stable`, `deprecated`. Experimental rules are off by default; run with `--enable-experimental` to activate.
- `suggestedFix` — Structured fix instructions (see below).
- `suppression` — Suppression directive available for this rule.
- `baselineStatus` — Only present when scan run with `--baseline`. Values: `new` (not in baseline; gates `--fail-on`), `baseline` (pre-existing), `resolved` (was in baseline, now fixed).

---

## Evidence object

Location and code context:

```jsonc
{
  "file":           "supabase/migrations/001_init.sql",  // workspace-relative path
  "line":           14,                                   // 1-indexed
  "column":         1,                                    // 1-indexed
  "endLine":        14,                                   // optional; 1-indexed
  "endColumn":      60,                                   // optional; 1-indexed
  "snippet":        "create table profiles (id uuid primary key, …);",
  "matchedPattern": "create-table-without-rls"            // optional; internal pattern label
}
```

**Required fields:**
- `file` — Workspace-relative path to the affected file.
- `line` — Starting line number (1-indexed).
- `column` — Starting column (1-indexed).
- `snippet` — The matched line or code fragment.

**Optional fields:**
- `endLine`, `endColumn` — End position if the issue spans multiple lines or columns.
- `matchedPattern` — Internal rule pattern id for debugging and telemetry.

---

## Suggested Fix object

Structured instructions for the agent:

```jsonc
{
  "type": "code-patch",
  "instructions": "Add `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;` plus at least one policy scoped to authenticated users.",
  "patchTemplate": "--- a/supabase/migrations/001_init.sql\n+++ b/supabase/migrations/001_init.sql\n@@ -12,6 +12,7 @@\n create table profiles (\n   id uuid primary key,\n   …\n );\n+ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;\n",
  "verificationCriteria": [
    "Migration contains ALTER TABLE … ENABLE ROW LEVEL SECURITY",
    "At least one CREATE POLICY exists for the table",
    "Re-scan no longer reports vibe-supabase-rls-disabled for this file"
  ]
}
```

**Required fields:**
- `type` — One of `code-patch`, `config-change`, or `manual`.
  - `code-patch` — Apply a code change (agent has a unified-diff template).
  - `config-change` — Update configuration file (e.g. `.env`, `tsconfig.json`).
  - `manual` — Human judgement required; agent can propose but not auto-apply.
- `instructions` — Plain-language description of the fix (agent reads this).

**Optional fields:**
- `patchTemplate` — Unified-diff template (relative to project root) the agent can adapt.
- `verificationCriteria` — Checklist of conditions the agent runs post-fix to confirm success. Each is a one-line assertion.

---

## Byte-identical guarantee

**Same input → same report, across all surfaces.**

The parity test (`test/parity.test.ts`) enforces this on every release:

```
CLI    : issues=224  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
MCP    : issues=224  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
Daemon : issues=224  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
```

(Fields that intentionally differ: `instanceId` — a fresh ULID per scan; `scannedAt` and `scanDurationMs` — wall clock.)

This guarantee holds because:
1. All surfaces link the same `shared/report/` code.
2. No surface-specific logic alters findings.
3. No state is shared between scans.

If you see a report with the same input but different findings across surfaces, it's a regression. File a bug.

---

## Agent Instructions object (optional)

Structured hints to guide the LLM through the fix loop:

```jsonc
{
  "preamble": "You are fixing issues found by CodeMore. Apply patches one issue at a time. After each, request re-scan via validate_fix.",
  "orderingHint": "blockers → criticals → majors",
  "doNotTouch": ["node_modules/**", "*.lock", ".env*"],
  "stopOn": "first-validator-failure"
}
```

**Optional fields:**
- `preamble` — Context for the LLM at the start of the fix session.
- `orderingHint` — Suggested order to process findings (e.g., highest severity first).
- `doNotTouch` — Glob patterns the agent should never modify.
- `stopOn` — Stop on: `first-validator-failure` (default), `first-rule-failure`, or `never`.

---

## Complete example

```jsonc
{
  "schemaVersion": "1.0.0",
  "scannedAt": "2026-06-12T14:32:01.234Z",
  "tool": {
    "name": "codemore",
    "version": "0.2.7"
  },
  "project": {
    "root": ".",
    "framework": "next.js",
    "language": "typescript",
    "fingerprint": "sha256:7f95f2c62e0d3ecea6f23fa8b5cd49d6e5e8c9b0a1b2c3d4e5f6a7b8c9d0e"
  },
  "summary": {
    "score": 42,
    "issuesTotal": 5,
    "bySeverity": {
      "BLOCKER": 1,
      "CRITICAL": 1,
      "MAJOR": 2,
      "MINOR": 1,
      "INFO": 0
    },
    "byCategory": {
      "security": 2,
      "bug": 2,
      "code-smell": 1
    },
    "filesAnalyzed": 23,
    "linesOfCode": 4821,
    "technicalDebtMinutes": 180
  },
  "issues": [
    {
      "id": "vibe-supabase-rls-disabled",
      "ruleVersion": "1.2.0",
      "instanceId": "01HZ9KGZQ7HBGF1XYZP2C3K4Q5",
      "lifecycle": "beta",
      "severity": "BLOCKER",
      "confidence": 0.95,
      "category": "security",
      "title": "Supabase table has no RLS policy",
      "evidence": {
        "file": "supabase/migrations/001_init.sql",
        "line": 14,
        "column": 1,
        "endLine": 14,
        "endColumn": 60,
        "snippet": "create table profiles (id uuid primary key);",
        "matchedPattern": "create-table-without-rls"
      },
      "whyItMatters": "Public Supabase client can read/write all rows without RLS enforcement. This is the #1 vulnerability in Lovable apps.",
      "citation": "https://codemore.tech/rules/vibe-supabase-rls-disabled",
      "suggestedFix": {
        "type": "code-patch",
        "instructions": "Add ENABLE ROW LEVEL SECURITY and a policy scoped to authenticated users.",
        "verificationCriteria": [
          "Migration contains ALTER TABLE profiles ENABLE ROW LEVEL SECURITY",
          "At least one CREATE POLICY exists for the table",
          "Re-scan no longer reports this issue"
        ]
      },
      "suppression": {
        "available": true,
        "directive": "// codemore-ignore: vibe-supabase-rls-disabled",
        "scope": "same-line"
      }
    },
    {
      "id": "core-quality-unused-variable",
      "ruleVersion": "2.1.0",
      "instanceId": "01HZ9KGZQ7HBGF1XYZP2C3K4Q6",
      "severity": "MINOR",
      "confidence": 0.88,
      "category": "code-smell",
      "title": "Variable declared but never used",
      "evidence": {
        "file": "src/handlers/api.ts",
        "line": 42,
        "column": 3,
        "snippet": "const userId = req.query.id;",
        "matchedPattern": "unused-const"
      },
      "whyItMatters": "Unused variables are often a sign of incomplete refactoring or copy-paste errors.",
      "citation": "https://codemore.tech/rules/core-quality-unused-variable"
    }
  ],
  "agentInstructions": {
    "preamble": "You are fixing issues found by CodeMore. Apply patches one issue at a time. After each, request re-scan via validate_fix.",
    "orderingHint": "blockers → criticals → majors → minors",
    "doNotTouch": ["node_modules/**", "*.lock", ".env*"],
    "stopOn": "first-validator-failure"
  },
  "meta": {
    "rulesEnabled": 64,
    "packsLoaded": [
      "core-security",
      "core-quality",
      "vibe-supabase",
      "vibe-auth"
    ],
    "scanDurationMs": 2341
  }
}
```

---

## See also

- [External tool adapters](./external-tools.md) — namespace and severity translation for ruff, biome, etc.
- [Security gate](./security-gate.md) — layered scanning workflow using the report.
- [CLI reference](https://codemore.tech/docs/cli) — scan options and output formats.
- [Rule catalog](./rules) — docs for all 64 native rules.
