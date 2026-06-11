import json, collections, os, sys

p = sys.argv[1] if len(sys.argv) > 1 else 'C:/codemore/codemore-issues-2026-06-09.json'
data = json.load(open(p, 'r', encoding='utf-8'))
issues = data['issues']

print(f'TOTAL: {len(issues)}    EXPORT DATE: {data["exportDate"]}')
print()
sev = collections.Counter(i.get('severity', '<none>') for i in issues)
for k in ('BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'):
    if sev[k]: print(f'  {k:8} {sev[k]}')
print()

print('TOP 25 by title:')
titles = collections.Counter(i.get('title', '<no-title>') for i in issues)
for k, v in titles.most_common(25):
    print(f'  {v:4}  {k}')
print()

# Drill into hallucinated-import — which packages?
print('SUPPLY-CHAIN findings (top 15 packages flagged):')
pkgs = collections.Counter()
for i in issues:
    if 'slopsquatting' in i.get('title', '') or 'not declared in package.json' in i.get('title', ''):
        desc = i.get('description', '')
        # Description shape: "`<spec>` is imported here but the package root `<pkg>` is not declared in..."
        import re
        m = re.search(r'package root `([^`]+)`', desc)
        if m:
            pkgs[m.group(1)] += 1
        else:
            m2 = re.search(r'`([^`]+)` is imported', desc)
            if m2: pkgs['SPEC:' + m2.group(1)] += 1
for k, v in pkgs.most_common(15):
    print(f'  {v:4}  {k}')
print()

# Files with most hallucinated-import hits
print('FILES with most hallucinated-import hits:')
hi_files = collections.Counter()
for i in issues:
    if 'slopsquatting' in i.get('title', '') or 'not declared' in i.get('title', ''):
        f = (i.get('location') or {}).get('filePath', '?')
        base = os.path.basename(f.replace('\\', '/'))
        hi_files[base] += 1
for k, v in hi_files.most_common(10):
    print(f'  {v:4}  {k}')
print()

# Duplicate-string distribution — file-level concentration tells us if it's mostly one or two files
print('DUPLICATE-STRING distribution by file (top 10):')
ds_files = collections.Counter()
for i in issues:
    if 'Same string literal' in i.get('title', ''):
        f = (i.get('location') or {}).get('filePath', '?')
        base = os.path.basename(f.replace('\\', '/'))
        ds_files[base] += 1
for k, v in ds_files.most_common(10):
    print(f'  {v:4}  {k}')
