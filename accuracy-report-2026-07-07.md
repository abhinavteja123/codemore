# Accuracy Audit — 2026-07-07 (pre-publish gate)

**Ask:** before publishing (npm/Marketplace/docs), measure real accuracy — true-positive rate on multiple real codebases + the synthetic vibe-coded apps — across the CLI/MCP/extension surfaces. Method: CLI `scan --json` on 7 targets; ground-truth diff on the 2 synthetic apps (planted vulns derived by *reading the apps*, not from scan output); subagent + snippet-level TP/FP judgment on real repos; surfaces covered by the existing parity/smoke suites (see §4).

## 1. Headline numbers

| Target | Kind | Findings | Spot-checked precision | Notes |
|---|---|---:|---|---|
| realistic-vibe-app | synthetic, planted | 15 | **recall 100%** on ~8 planted vulns | all MCP-secret/env-leak/JWT/CORS/RLS caught |
| messy-vibe-app | synthetic, planted | 24 | **recall 100%** on ~10 planted; both FP-traps correctly ignored | `unused-export` fired 7× (FP class) |
| NLP | real, Python | 13 | **100%** (13/13 TP, every finding verified) | self-scoped 16k→43 files correctly (venv/data ignored) |
| claw-code | real, polyglot | 5 | **80%** (4/5; 1 `vibe-py-secret-in-log` FP on a session-id print) | **101 Rust files = zero native coverage**; "100/100 score" reflects blindness, not cleanliness |
| AImentor | real, Python+TS | 224 | BLOCKERs: 2/5 TP — **real OpenAI key caught in `backend/.env`** (headline TP); 3 path-traversal FPs on constant `os.path.join(DIR,"literal")` | top noise: py-unused-import 57, leftover-print 43 |
| open-design | real, TS monorepo, 1.35M LOC | 8,615 | BLOCKER sample: `shell-injection` fires on **safe** array-arg `spawn/execFile` (FP class) | `non-null-assertion` 1,893 + `unused-export` 1,798 + `loose-equality` 1,500 ≈ 60% of volume |
| codemore (self) | real, TS | 2,148 product | — | `unused-export` 851 (~40%); 87/98 BLOCKERs = innerhtml in vendored `.agents/` script |

## 2. What's genuinely good

- **Planted-vuln recall = 100%** on both synthetic apps: every RLS/secret/CORS/JWT/injection-class plant caught, at the right file:line.
- **Calibration holds:** placeholder `ghp_xxxx…` and `${SUPABASE_KEY}` indirection correctly NOT flagged; docstring-substring, `TYPE_CHECKING`, `__future__` traps all passed (NLP 13/13).
- **Real catch:** a real-shaped OpenAI key in AImentor's `backend/.env` — exactly the product's pitch, found in the wild.
- **Walker scoping works on Python repos:** NLP's 16k files self-scoped to the 43 real sources.

## 3. Precision defects found (fix before publish)

1. **`core-quality-unused-export` (worst, TS-only):** 851 on codemore, 1,798 on open-design — fires on every export not imported *in the same file*; needs ProjectIndex cross-file import resolution or demotion to experimental. Single largest noise source (~30-40% of TS findings).
2. **`core-security-shell-injection`:** flags array-arg `spawn(cmd, [a, b])` / `execFile` — the *safe* form. Should require string interpolation into a shell or `shell: true`. (open-design: 25 BLOCKERs, sampled ones FP.)
3. **`core-security-path-traversal`:** flags `os.path.join(CONST_DIR, "literal.json")` — no user input in the path. (AImentor: 3/3 sampled FP.)
4. **Vendored-dir leak:** `.agents/` / `.claude/` plugin scripts scanned in-repo → 87 innerhtml BLOCKERs on a vendored browser script (codemore self). Walker should skip well-known vendored/tooling dirs.
5. **`vibe-py-secret-in-log`:** still name-heuristic-fragile (`session.session_id` print flagged, claw-code).
6. **Known gap (documented, not a bug):** Rust/Go invisible without `--external-tools` (claw-code's 101 .rs files) — but a "100/100" score on an uncovered repo is misleading; consider surfacing "N files in unsupported languages" in the summary instead of silently scoring clean.

## 4. Surfaces (CLI / MCP / extension)

- CLI: all scans above ran through `cli.js scan --json`.
- MCP: `test/surface-smoke.test.ts` does a live `serve-mcp` initialize + tools/list (6 tools); `test/parity.test.ts` proves CLI/MCP/daemon reports byte-identical. Both green in the 151-test suite — parity is an enforced invariant, not re-measured per repo.
- Extension: shares the same scan core; EDH smoke (`test/edh/suite/smoke.test.ts`) covers activation. Not separately exercised here.

## 5. Verdict

**Security recall is real and the headline works** (100% on planted vulns; real key caught in the wild). **Precision at volume is not publish-ready on TS codebases:** three FP classes (`unused-export`, array-arg `shell-injection`, constant `path-traversal`) plus vendored-dir leakage would greet a new TS-monorepo user with thousands of findings, most noise. Python-repo experience is already excellent (100% precision, NLP).

**Pre-publish blockers (recommended):** fix/demote §3.1-3.4. §3.5-3.6 can ship as known-limitations notes.
