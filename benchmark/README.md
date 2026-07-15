# Benchmark (Phase 6) — 50 plausibly AI-built public repos

- `targets.json`: 50 public GitHub repos (URL, stars, stack, license, selection signal), smallest-first; `license: "NONE"` flags repos with no license (scanning is still fine).
- Run: `node scripts/benchmark.js` (sequential, resumable — skips any `results/<n>.json` that exists; `--limit N` for smoke tests). Reports land in `results/<n>.json`, clones are temp-dir and deleted after each scan.
- Ethics: any writeup uses **aggregates only** — never a repo name next to its vulnerabilities; `results/` is gitignored for that reason.
- Ethics: a live severe secret found in a repo with real users gets reported privately to the human, never published.
- A scan counts as success if its JSON report is valid, regardless of exit code (Windows libuv exit-crash is cosmetic).
