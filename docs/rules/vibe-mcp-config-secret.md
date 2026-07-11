# vibe-mcp-config-secret

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | beta | 0.95 |

**Pack:** `vibe-secrets`

## What it catches

Real credentials pasted into MCP-server / agent-coding configuration files. The rule recognises:

- `mcp.json`
- `claude_desktop_config.json`
- `cursor.json`
- Any path containing `/.cursor/mcp.json`, `/.claude/mcp.json`, `/.cursor/settings.json`, or `/.cursor/rules`

Inside those files, it walks every `env` object (the standard slot for child-process env vars) and flags entries where the key looks like a secret (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `DATABASE_URL`, etc.) and the value is **not** a placeholder.

Placeholder forms that are skipped:

- `${VAR_NAME}` and `$VAR_NAME` indirections
- `<REPLACE_ME>` / `<your-key-here>` style
- Strings under 12 characters

## Why it matters

GitGuardian's State of Secrets Sprawl 2026 attributed **>24,000 exposed credentials** to this exact pattern: a developer pastes a real key into an MCP config while wiring up a Cursor or Claude Code integration, intends to clean it up later, and commits the file as part of "checkpoint my progress".

Once the file lands in git history, the credential is shipped to every fork and clone, indexed by code-search engines within minutes, and rotated only if someone notices. The fact that the config file isn't running code — it's "just config" — gives a false sense that it's harmless.

## Example: failing code

```jsonc
{
  "mcpServers": {
    "supabase-admin": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiJ9.realserviceroleJWTvalue.signature"
      }
    }
  }
}
```

Rule reports a BLOCKER on the `SUPABASE_SERVICE_ROLE_KEY` line.

## Example: how to fix

```jsonc
{
  "mcpServers": {
    "supabase-admin": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
```

Then export the variable in your shell (or load it from a `.gitignore`'d `.env` file before starting your agent):

```bash
export SUPABASE_SERVICE_ROLE_KEY="$(cat ~/.config/secrets/supabase-service-role)"
```

If the literal was ever committed, **rotate the credential first**. Git history preserves it regardless of how the file is edited afterward.

## Known limitations

- We do not connect to issuing services to verify whether a flagged token is still active. Treat every flagged value as live until you have rotated it.
- Non-`env` slots that effectively carry credentials (e.g. `headers.Authorization`) are not yet scanned. A future version will broaden.
- Values shorter than 12 characters are treated as placeholders. Real tokens this short are extremely rare and not worth the false-positive tax.

## Suppression

```jsonc
{
  // codemore-ignore-next-line: vibe-mcp-config-secret
  "OPENAI_API_KEY": "sk-this-is-actually-fine"
}
```

Or via `.codemorerc.json`:

```jsonc
{
  "rules": {
    "vibe-mcp-config-secret": "off"
  }
}
```

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [GitGuardian — State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026-pr/)
- [Cursor — MCP setup docs](https://docs.cursor.com/context/model-context-protocol)
