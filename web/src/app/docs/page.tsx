import Link from 'next/link';
import { listRuleIds } from '@/lib/docs';

export const metadata = {
  title: 'CodeMore — Docs',
  description: 'The static analyzer your AI agent reads. For vibe-coded apps.',
};

export default function DocsHome() {
  const ruleCount = listRuleIds().length;
  return (
    <>
      <h1>CodeMore docs</h1>
      <p className="lead text-lg">
        The static analyzer your AI agent reads. Detect production-blocking bugs in vibe-coded
        apps and hand a fix-ready report straight to Cursor, Claude Code, Codex, or Copilot.
      </p>

      <h2>30-second install</h2>
      <p>Pick the surface that matches how you ship code:</p>
      <ul>
        <li><strong>CLI</strong>: <code>npx codemore scan .</code></li>
        <li><strong>MCP server</strong> (for Cursor / Claude Code / Codex CLI): add to your agent&apos;s MCP config.</li>
        <li><strong>VS Code extension</strong>: install <code>CodeMore</code> from the marketplace.</li>
        <li><strong>GitHub Action</strong>: one-file YAML that posts a fix-ready PR comment.</li>
      </ul>
      <p>
        Full per-surface instructions live in <Link href="/docs/install">/docs/install</Link>.
      </p>

      <h2>What ships</h2>
      <ul>
        <li>
          <strong>{ruleCount} native rules</strong> across TypeScript, JavaScript, SQL, and Python —
          browse them at <Link href="/docs/rules">/docs/rules</Link>.
        </li>
        <li>
          <strong>4 opt-in external-tool adapters</strong> (Ruff, golangci-lint, clippy, Biome) for
          polyglot repos. See <Link href="/docs/external-tools">/docs/external-tools</Link>.
        </li>
        <li>
          <strong>Schema-stable report</strong> at <code>codemore-report.json</code> v1.0.0. AI
          agents consume the same shape regardless of which surface produced it. See{' '}
          <Link href="/docs/schema">/docs/schema</Link>.
        </li>
        <li>
          <strong>Agentic fix loop</strong> — <code>apply_fix</code> + <code>validate_fix</code>{' '}
          MCP tools. The agent generates a patch, the validator re-runs the rule, the loop retries
          up to 3 times.
        </li>
      </ul>

      <h2>Why this exists</h2>
      <ul>
        <li>Veracode 2025/26: 45% of AI-generated code carries OWASP Top-10 vulnerabilities.</li>
        <li>Symbiotic: 98% of 1,072 scanned vibe-coded sites had ≥ 1 security flaw.</li>
        <li>GitGuardian SOSS 2026: AI-tool commits leak secrets at 2× the human baseline.</li>
        <li>2026: 35 CVEs/month attributed to AI-generated code, up from 6/month in January.</li>
      </ul>
      <p>
        Existing scanners (SonarQube, DeepSource, Snyk) target human reviewers via dashboards.
        CodeMore targets the LLM that wrote the code in the first place.
      </p>

      <h2>Get involved</h2>
      <p>
        See <Link href="/docs/contributing">/docs/contributing</Link> for both code and rule
        contributions. The rule PR validator gates every submission against TP + FP fixtures
        before a human even looks.
      </p>
    </>
  );
}
