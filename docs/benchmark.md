# 50-app benchmark — AI-built repos in the wild

We scanned **50 public GitHub repositories that are plausibly AI-built**
(README says Lovable / Bolt.new / Cursor / v0 / Claude Code, AI-starter
Next.js+Supabase profile, or recent hackathon projects) with CodeMore
0.3.0, then **hand-triaged 133 findings** across the seven
highest-impact rules — and published the false-positive rates alongside
the wins.

## Headline

| Metric | Value |
|---|---|
| Repos with ≥ 1 BLOCKER | 20 / 50 (40%) |
| …after discounting triaged false-positive classes | 12 / 50 (24%) |
| Total findings | 8,330 (median 36 per repo, max 2,468) |
| Repos with zero findings | 9 |
| Hackathon repos with ≥ 1 BLOCKER | 4 / 5 (80%) |
| Distinct rules fired | 41 |

## Method, in one paragraph

Targets are listed publicly with their selection signal in
[`benchmark/targets.json`](https://github.com/abhinavteja123/codemore/blob/main/benchmark/targets.json).
Each repo was shallow-cloned, scanned once with the default rule set,
and the clone deleted. Aggregates are computed by repos-affected (one
huge repo can't dominate). Triage sampled findings across repos and,
where the evidence snippet wasn't enough to judge, verified the actual
line in the live repository.

## Honest false-positive note

Three BLOCKER-severity rules were dominated by false positives in this
corpus and are documented as calibration follow-ups:
`vibe-xss-dangerously-set` (90% FP — mostly the vendored shadcn/ui
`chart.tsx` pattern and unrecognized DOMPurify sanitization),
`core-security-innerhtml-assignment` (~95% FP — escape helpers and
static template literals classified as dynamic), and
`core-security-hardcoded-secret-pattern` (0% TP here — every hit was a
deliberate fixture key in a developer tool's test suite; the same rule
was 100% precise on application repos in the June audit). That is why
the headline says 24%, not 40%. The best rules held up:
cyclomatic-complexity 90% TP, leftover-console 78% TP, and every
clone-verified `unused-export` claim was true.

No live secret was found in any scanned repository. Per the
[benchmark ethics rules](https://github.com/abhinavteja123/codemore/blob/main/benchmark/README.md),
no repo name is ever paired with a specific finding.

## Full report

Methodology, per-rule triage table, verified true-positive patterns,
and the documented rule follow-ups:
[`benchmark/REPORT.md`](https://github.com/abhinavteja123/codemore/blob/main/benchmark/REPORT.md).

Related: [Limitations](/docs/limitations) · [Security gate](/docs/security-gate)
