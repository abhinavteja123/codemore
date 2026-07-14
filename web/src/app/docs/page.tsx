import Link from "next/link";

import { listRuleIds } from "@/lib/docs";
import CodeBlock from "@/components/docs/CodeBlock";
import Callout from "@/components/docs/Callout";
import NextStep from "@/components/docs/NextStep";

export const metadata = {
  title: "CodeMore — Docs",
  description:
    "CodeMore is the structured-feedback bus between static scanners and coding agents. 64 rules · 8 adapters · CLI · MCP · VS Code · GitHub Action.",
};

export default function DocsHome() {
  const ruleCount = listRuleIds().length;
  return (
    <>
      <h1>CodeMore docs</h1>
      <p className="lead text-lg">
        The static analyzer your AI agent reads. CodeMore detects
        production-blocking bugs in vibe-coded apps and hands a fix-ready
        report straight to Cursor, Claude Code, Codex, or Copilot.
      </p>

      <h2 id="quickstart">Quick start</h2>
      <CodeBlock lang="shell" label="install · 30 seconds">{`npx codemore@latest scan .`}</CodeBlock>
      <p>
        Full per-surface install — including MCP server configs, the VS Code
        extension, the GitHub Action, and the hosted Web Scanner — lives at{" "}
        <Link href="/docs/install">/docs/install</Link>.
      </p>

      <h2 id="what-ships">What ships in v0.2.7</h2>
      <ul>
        <li>
          <strong>{ruleCount} native rules</strong> across TypeScript, JavaScript,
          SQL, and Python — grouped into 6 packs (core-security, core-quality,
          vibe-auth, vibe-frontend, vibe-secrets, vibe-supabase).
          Browse them at <Link href="/docs/rules">/docs/rules</Link>.
        </li>
        <li>
          <strong>8 opt-in external-tool adapters</strong> — Ruff,
          golangci-lint, clippy, Biome, bandit, gitleaks, npm-audit, pip-audit.
          See <Link href="/docs/external-tools">/docs/external-tools</Link>.
        </li>
        <li>
          <strong>Schema-stable report</strong> at <code>codemore-report.json</code>{" "}
          v1.0.0. AI agents consume the same shape regardless of surface. See{" "}
          <Link href="/docs/schema">/docs/schema</Link>.
        </li>
        <li>
          <strong>Agentic fix loop</strong> — <code>apply_fix</code> +{" "}
          <code>validate_fix</code> MCP tools, and <code>codemore fix</code>{" "}
          from the CLI. The agent generates a patch, the validator re-runs the
          rule and the file-scoped tests, the loop retries up to 3 times.
        </li>
        <li>
          <strong>SARIF output</strong> — <code>codemore scan . --format sarif</code>{" "}
          uploads straight to GitHub code scanning.
        </li>
        <li>
          <strong>Byte-identical reports</strong> across CLI, MCP, VS Code, and
          the GitHub Action — same fingerprint <code>sha256:…</code>.
        </li>
      </ul>

      <h2 id="why">Why this exists</h2>
      <Callout type="note" title="real numbers">
        Veracode 2025/26 — 45% of AI-generated code carries OWASP Top-10
        vulnerabilities. Symbiotic — 98% of 1,072 scanned vibe-coded sites had
        at least one security flaw. DEV audit — 70% of audited Lovable apps
        shipped with Supabase RLS turned off. GitGuardian SOSS 2026 — AI-tool
        commits leak secrets at 2× the human baseline.
      </Callout>
      <p>
        Existing scanners (SonarQube, DeepSource, Snyk) target human reviewers
        via dashboards. CodeMore targets the LLM that wrote the code in the
        first place — and emits the report in a shape the LLM can act on
        without translation.
      </p>

      <h2 id="audit">The 2026-06-12 audit</h2>
      <p>
        We scanned 10 real codebases and triaged the BLOCKER findings by hand.
        Aggregate ~85% true-positive rate. The audit caught real OpenAI keys
        hidden behind <code>.gitignore</code>, ten Supabase RLS holes in a
        single Lovable export, real shell + SQL injection in production
        deployments. Read the full numbers at{" "}
        <Link href="/docs/limitations">/docs/limitations</Link> (it also lists
        what we deliberately don&apos;t catch).
      </p>

      <h2 id="contribute">Get involved</h2>
      <p>
        Every rule contribution requires a TP fixture, an FP fixture, a docs
        page, and a registry entry. The PR bot enforces all four before a
        human even looks. See{" "}
        <Link href="/docs/contributing">/docs/contributing</Link>.
      </p>

      <NextStep
        href="/docs/install"
        title="Install in 30 seconds"
        description="Choose a surface — CLI, MCP server, VS Code extension, GitHub Action, or hosted Web Scanner."
      />
    </>
  );
}
