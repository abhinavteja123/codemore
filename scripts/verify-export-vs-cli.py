"""
Verify an extension-exported issues JSON against a fresh CLI scan of the
same workspace. Reports:
  - Per-surface totals (extension export vs CLI)
  - Per-rule (well, per-title since the legacy export drops rule ids)
    breakdown comparison
  - Findings present in one surface but not the other
"""
import json, collections, io, os, sys

EXPORT_PATH = sys.argv[1] if len(sys.argv) > 1 else 'C:/codemore/codemore-issues-2026-06-09.json'
CLI_JSON_PATH = sys.argv[2] if len(sys.argv) > 2 else 'C:/tmp/cli-self.json'

ext = json.load(io.open(EXPORT_PATH, 'r', encoding='utf-8'))
cli = json.load(io.open(CLI_JSON_PATH, 'r', encoding='utf-8'))

ext_issues = ext['issues']
cli_issues = cli['issues']

print('=' * 64)
print('A. TOTALS')
print('=' * 64)
print(f'  Extension export totalIssues: {ext["totalIssues"]:>5}')
print(f'  CLI summary.issuesTotal:      {cli["summary"]["issuesTotal"]:>5}')
print(f'  Match: {"YES" if ext["totalIssues"] == cli["summary"]["issuesTotal"] else "NO — surfaces diverged"}')
print()

print('=' * 64)
print('B. SEVERITY BREAKDOWN')
print('=' * 64)
ext_sev = collections.Counter(i.get('severity', '<none>') for i in ext_issues)
cli_sev = cli['summary']['bySeverity']
print(f'  {"severity":10}  {"ext":>6}  {"cli":>6}  match?')
for k in ('BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'):
    e, c = ext_sev.get(k, 0), cli_sev.get(k, 0)
    print(f'  {k:10}  {e:>6}  {c:>6}  {"OK" if e == c else "MISMATCH"}')
print()

print('=' * 64)
print('C. PER-RULE BREAKDOWN (extension uses titles; CLI uses rule ids)')
print('=' * 64)

# Build extension counts by title
ext_titles = collections.Counter(i.get('title', '<no-title>') for i in ext_issues)
# Build CLI counts by both id and title for comparison
cli_by_id = collections.Counter(i['id'] for i in cli_issues)
cli_by_title = collections.Counter(i['title'] for i in cli_issues)

# Map titles to rule ids using the CLI's title -> id mapping
title_to_id = {}
for i in cli_issues:
    t = i['title']
    if t not in title_to_id:
        title_to_id[t] = i['id']

print(f'  {"title (rule)":<55}  {"ext":>4}  {"cli":>4}  match?')
print(f'  {"-" * 55}  {"-" * 4}  {"-" * 4}  ----')
all_titles = sorted(set(ext_titles) | set(cli_by_title), key=lambda t: -(ext_titles.get(t, 0) + cli_by_title.get(t, 0)))
mismatches = []
for t in all_titles:
    e, c = ext_titles.get(t, 0), cli_by_title.get(t, 0)
    rule_id = title_to_id.get(t, '?')
    short = (t[:52] + '...') if len(t) > 55 else t
    mark = 'OK' if e == c else 'DIFF'
    if e != c:
        mismatches.append((t, e, c, rule_id))
    print(f'  {short:<55}  {e:>4}  {c:>4}  {mark}')
print()

print('=' * 64)
print('D. MISMATCHES')
print('=' * 64)
if not mismatches:
    print('  None — every rule fires identically in both surfaces.')
else:
    print(f'  {len(mismatches)} title(s) have different counts:')
    for t, e, c, rid in mismatches:
        print(f'    {rid:<48}  ext={e}  cli={c}  delta={e-c:+}')
print()

print('=' * 64)
print('E. FILES WITH MOST FINDINGS (top 12, CLI side)')
print('=' * 64)
cli_files = collections.Counter()
for i in cli_issues:
    p = i['evidence']['file']
    base = os.path.basename(p.replace('\\', '/'))
    cli_files[base] += 1
for k, v in cli_files.most_common(12):
    print(f'  {v:4}  {k}')
