import json, io, collections

mcp = json.load(io.open('C:/tmp/mcp-self.json', 'r', encoding='utf-8'))
cli = json.load(io.open('C:/tmp/cli-self.json', 'r', encoding='utf-8'))

def normalize_path(p):
    return p.replace('\\', '/')

def fingerprint(i):
    e = i['evidence']
    return (i['id'], normalize_path(e['file']), e['line'], e['column'], e.get('matchedPattern', ''))

mcp_fps = [fingerprint(i) for i in mcp['issues']]
cli_fps = [fingerprint(i) for i in cli['issues']]

print(f'CLI total: {len(cli_fps)}    MCP total: {len(mcp_fps)}')
mcp_set = set(mcp_fps)
cli_set = set(cli_fps)
only_mcp = mcp_set - cli_set
only_cli = cli_set - mcp_set
print(f'Only in MCP: {len(only_mcp)}')
print(f'Only in CLI: {len(only_cli)}')
print()

if only_mcp:
    print('=' * 60)
    print('Findings ONLY in MCP (not seen by CLI):')
    print('=' * 60)
    for fp in sorted(only_mcp)[:20]:
        rid, f, line, col, mp = fp
        print(f'  {rid}')
        print(f'    {f}:{line}:{col}  matched: {mp}')

if only_cli:
    print('=' * 60)
    print('Findings ONLY in CLI (not seen by MCP):')
    print('=' * 60)
    for fp in sorted(only_cli)[:20]:
        rid, f, line, col, mp = fp
        print(f'  {rid}')
        print(f'    {f}:{line}:{col}  matched: {mp}')

# Count by rule, where the totals differ
by_rule_mcp = collections.Counter(i['id'] for i in mcp['issues'])
by_rule_cli = collections.Counter(i['id'] for i in cli['issues'])
all_rules = set(by_rule_mcp) | set(by_rule_cli)
print()
print('=' * 60)
print('Per-rule count diffs:')
print('=' * 60)
for r in sorted(all_rules):
    m, c = by_rule_mcp.get(r, 0), by_rule_cli.get(r, 0)
    if m != c:
        print(f'  {r:<48}  cli={c}  mcp={m}  diff={m-c:+}')
