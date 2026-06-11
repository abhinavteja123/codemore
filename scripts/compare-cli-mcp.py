import json, io, collections, sys

cli = json.load(io.open(sys.argv[1], 'r', encoding='utf-8'))
mcp = json.load(io.open(sys.argv[2], 'r', encoding='utf-8'))

def fp(i):
    e = i['evidence']
    return (i['id'], e['file'].replace('\\', '/'), e['line'], e['column'])

cli_fps = sorted(fp(i) for i in cli['issues'])
mcp_fps = sorted(fp(i) for i in mcp['issues'])

print(f'CLI total: {len(cli_fps)}    MCP total: {len(mcp_fps)}')
print(f'CLI BLOCKERs: {cli["summary"]["bySeverity"]["BLOCKER"]}    MCP BLOCKERs: {mcp["summary"]["bySeverity"]["BLOCKER"]}')
print(f'CLI score: {cli["summary"]["score"]}    MCP score: {mcp["summary"]["score"]}')
print(f'Identical fingerprints (modulo instanceId): {cli_fps == mcp_fps}')

if cli_fps != mcp_fps:
    only_mcp = set(mcp_fps) - set(cli_fps)
    only_cli = set(cli_fps) - set(mcp_fps)
    print(f'\nOnly in MCP ({len(only_mcp)}):')
    for f in sorted(only_mcp)[:10]:
        print(f'  {f}')
    print(f'\nOnly in CLI ({len(only_cli)}):')
    for f in sorted(only_cli)[:10]:
        print(f'  {f}')
