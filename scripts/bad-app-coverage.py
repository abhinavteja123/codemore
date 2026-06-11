import json, io, collections, os, sys

cli = json.load(io.open('C:/tmp/vibe-bad-cli.json', 'r', encoding='utf-8'))
counts = collections.Counter(i['id'] for i in cli['issues'])

all_rules = []
for pack in sorted(os.listdir('shared/packs')):
    pdir = os.path.join('shared/packs', pack)
    if not os.path.isdir(pdir): continue
    for f in sorted(os.listdir(pdir)):
        if f.endswith('.ts') and f != 'index.ts':
            all_rules.append((pack, f[:-3]))

print(f'{"pack":<16}  {"rule":<48}  {"hits":>5}  status')
print('-' * 84)
fired = 0
for pack, rule in all_rules:
    n = counts.get(rule, 0)
    status = 'FIRED' if n > 0 else 'MISSING'
    if n > 0: fired += 1
    print(f'{pack:<16}  {rule:<48}  {n:>5}  {status}')
print('-' * 84)
print(f'Coverage: {fired} / {len(all_rules)} = {fired * 100 / len(all_rules):.1f}%')
