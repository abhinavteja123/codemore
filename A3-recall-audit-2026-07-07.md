# A3 — External-Tool Recall Audit (2026-07-07)

**PLAN.md Track A / A3.** Precision was fixed in the 2026-06-12 audit (22% → 77%); recall — *does the native catalog miss things the external tools catch?* — had never been measured. This is a **bounded first pass**, not the full Part-7 sweep.

## Method

Installed `bandit` (1.9.4), `ruff`, `pip-audit`, `@biomejs/biome` (2.5.2). Ran `cli.js scan <target> --json` (native) vs `--external-tools <tools> --json` (native + external) on two targets, diffed the `ext:*`-prefixed findings against native findings.

| Target | Kind | Source |
|---|---|---|
| `flask-sqlalchemy` | Python library | cloned `github.com/pallets/flask-sqlalchemy` |
| `realistic-vibe-app` | JS/TS synthetic vibe app | `samples.json` local fixture (planted vulns) |

**Not run:** `gitleaks`, `golangci-lint` (binary downloads not fetched), `clippy` (needs a Rust toolchain). No real Python *application* with planted vulns is configured in `samples.json` (it holds JS/TS Vercel examples + 2 local synthetic apps) — so this leans on one real Python library + one synthetic JS app. A fuller audit needs the Part-7 codebases pointed to in `samples.json`.

## Results

### Python (flask-sqlalchemy) — bandit vs native

- native: **3** findings (2× `core-quality-py-unused-import`, 1× `core-bugs-todo-fixme`)
- bandit: **269** findings — but **264 are B101 `assert_used`** (MINOR): asserts in test files. Native deliberately excludes this class ("agent-actionable or it's not a rule" — an assert isn't a fixable defect). Correctly *not* a recall gap.
- ruff: 0 · pip-audit: 0 (no lint config surfaced / no dependency vulns)
- Non-noise remainder = **5** bandit hardcoded-credential findings (B105/B106/B107):

| bandit finding | location | in test code? |
|---|---|---|
| B107 | `examples/flaskr/tests/conftest.py:60` | yes |
| B105 | `examples/flaskr/tests/test_auth.py:14` | yes |
| B106 | `examples/flaskr/tests/test_auth.py:25` | yes |
| B105 | `examples/flaskr/tests/test_auth.py:26` | yes |
| **B105** | **`examples/todo/app.py:16`** | **NO — real app code** |

### JS (realistic-vibe-app) — biome vs native

- native: **15** findings · biome adds **0** (`biome-only = 0`).
- Caveat: biome without a `biome.json` in the target lints little by default — a 0 here is *inconclusive*, not proof of no gap. Re-run with a biome config to make the JS recall number meaningful.

## The one genuine recall gap

**`examples/todo/app.py:16` — a hardcoded password string** that bandit's B105 flags and native's `core-security-hardcoded-secret-pattern` **misses**. Notably native *did* fire `core-bugs-todo-fixme` on the very next line (`app.py:17`), so the file was scanned — the secret pattern simply didn't match this assignment form. **Follow-up:** inspect line 16's shape and decide whether the native secret rule should cover Python `password = "..."` string-assignment (bandit B105/B106/B107 semantics). The 4 test-file hits are correctly ignored by native.

## Verdict

Native Python security recall is **honest** against bandit once B101 assert-noise (98% of bandit's volume here) is set aside — no large silent miss. One real candidate to close: the hardcoded-string-secret assignment form (bandit B105-107) in app code. JS recall is **unmeasured** (biome needs config). clippy/gitleaks/golangci recall still **unmeasured** (tools not installed).

## Bonus — A1 adapters validated live

The `bandit`/`ruff`/`pip-audit`/`biome` adapters (hardened in A1, `98f52c7`) ran against **real** tool output on real code and parsed cleanly — zero parse/version-drift diagnostics. First real-world exercise of the extracted `parseXOutput` parsers.
