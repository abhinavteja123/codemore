import Link from "next/link";

import CodeBlock from "@/components/docs/CodeBlock";
import Callout from "@/components/docs/Callout";
import NextStep from "@/components/docs/NextStep";

export const metadata = {
  title: "Contributing — CodeMore",
  description:
    "Two contribution paths: a rule (detector) or anything else. The PR bot enforces TP + FP fixtures, the docs page, and the registry entry before a human reviews.",
};

export default function ContributingPage() {
  return (
    <>
      <h1>Contributing</h1>
      <p className="lead">
        Two paths, both bot-validated before a human looks. Rule contributions
        need TP + FP fixtures + a docs page + a registry entry. Everything else
        follows the standard PR flow.
      </p>

      <h2 id="paths">Two paths</h2>
      <ul>
        <li>
          <strong>Rule contributions</strong> (new detectors). Read{" "}
          <a href="https://github.com/abhinavteja123/codemore/blob/main/CONTRIBUTING-RULES.md">
            CONTRIBUTING-RULES.md
          </a>. The PR validator gates every submission.
        </li>
        <li>
          <strong>Everything else</strong> (CLI, MCP server, extension, daemon,
          web, docs, scripts). Read{" "}
          <a href="https://github.com/abhinavteja123/codemore/blob/main/CONTRIBUTING.md">
            CONTRIBUTING.md
          </a>.
        </li>
      </ul>

      <h2 id="quickstart">Quick start</h2>
      <CodeBlock lang="shell">{`# Install (postinstall skips binary downloads in dev automatically).
npm ci

# Type-check.
npx tsc -p tsconfig.publish.json

# Run the CLI against a fixture.
node cli.js scan corpus/rules/vibe-no-rate-limit/tp --json --enable-experimental

# Run the PR validator on the working tree.
node scripts/validate-rule-pr.js

# Unit tests.
npm run test:unit`}</CodeBlock>

      <h2 id="rule-shape">A rule contribution must include</h2>
      <ol>
        <li>Rule module under <code>shared/packs/&lt;pack&gt;/&lt;rule-id&gt;.ts</code></li>
        <li>TP fixture under <code>corpus/rules/&lt;rule-id&gt;/tp/</code> — MUST trigger the rule</li>
        <li>FP fixture under <code>corpus/rules/&lt;rule-id&gt;/fp/</code> — MUST NOT trigger the rule</li>
        <li>Docs page under <code>docs/rules/&lt;rule-id&gt;.md</code></li>
        <li>Registration entry in the pack&apos;s <code>index.ts</code></li>
      </ol>

      <Callout type="warning" title="lifecycle gating">
        Every new rule ships at <code>lifecycle: &apos;experimental&apos;</code>{" "}
        by default. Promotion to <code>beta</code> requires &lt; 5% FP rate on
        the 6-fixture corpus AND 0% FP rate on the Vercel reference apps.
        Stable requires 30-day telemetry &lt; 2% FP.
      </Callout>

      <h2 id="verify">Verify before opening a PR</h2>
      <ul>
        <li><code>npx tsc -p tsconfig.publish.json</code> is clean.</li>
        <li><code>node scripts/validate-rule-pr.js</code> reports <em>passed</em>.</li>
        <li>
          <code>npm run scan:samples</code> produces no new BLOCKERs on the
          reference apps — our false-positive canary.
        </li>
        <li>
          <code>npx mocha --require ts-node/register test/parity.test.ts</code>{" "}
          is green.
        </li>
      </ul>

      <h2 id="security">Security disclosures</h2>
      <p>
        Read{" "}
        <Link href="https://github.com/abhinavteja123/codemore/blob/main/SECURITY.md">
          SECURITY.md
        </Link>
        . Don&apos;t open public GitHub issues for security findings — use the
        private vulnerability reporting flow.
      </p>

      <h2 id="conduct">Code of conduct</h2>
      <p>
        By participating you agree to abide by our{" "}
        <a href="https://github.com/abhinavteja123/codemore/blob/main/CODE_OF_CONDUCT.md">
          Code of Conduct
        </a>
        .
      </p>

      <NextStep
        href="/docs/rules"
        title="Browse the catalog before contributing"
        description="64 rules across 6 packs. See the shape, the lifecycle gates, the pack ownership before opening a PR."
      />
    </>
  );
}
