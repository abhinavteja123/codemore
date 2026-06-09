import Link from 'next/link';

export const metadata = { title: 'Contributing — CodeMore' };

export default function ContributingPage() {
  return (
    <>
      <h1>Contributing</h1>
      <p>Two contribution paths, both documented in the repo:</p>
      <ul>
        <li>
          <strong>Rule contributions</strong> (new detectors). Read{' '}
          <a href="https://github.com/K0802s/codemore-vscode/blob/main/CONTRIBUTING-RULES.md">
            CONTRIBUTING-RULES.md
          </a>. The PR validator gates every submission against TP + FP fixtures before a human
          sees it.
        </li>
        <li>
          <strong>Everything else</strong> (CLI, MCP server, extension, daemon, web, docs,
          scripts). Read{' '}
          <a href="https://github.com/K0802s/codemore-vscode/blob/main/CONTRIBUTING.md">
            CONTRIBUTING.md
          </a>.
        </li>
      </ul>

      <h2>Quick start</h2>
      <pre><code>{`# Skip the binary download in dev — set the flag.
CODEMORE_SKIP_BINARY_DOWNLOAD=1 npm ci

# Type-check.
npx tsc -p tsconfig.publish.json

# Run the CLI against a fixture.
node cli.js scan corpus/rules/vibe-no-rate-limit/tp --json --enable-experimental

# Run the PR validator on the working tree.
node scripts/validate-rule-pr.js

# Unit tests.
npm run test:unit
`}</code></pre>

      <h2>Verify before opening a PR</h2>
      <ul>
        <li><code>npx tsc -p tsconfig.publish.json</code> is clean.</li>
        <li><code>node scripts/validate-rule-pr.js</code> reports <em>passed</em>.</li>
        <li>
          <code>npm run scan:samples</code> produces no new BLOCKERs on the reference apps. They
          are our false-positive canary.
        </li>
        <li>
          <code>
            npx mocha --require ts-node/register &apos;test/parity.test.ts&apos;
          </code>{' '}
          is green.
        </li>
      </ul>

      <h2>Security disclosures</h2>
      <p>
        Read <Link href="https://github.com/K0802s/codemore-vscode/blob/main/SECURITY.md">SECURITY.md</Link>. Don&apos;t open public GitHub issues for security findings — use
        the private vulnerability reporting flow.
      </p>

      <h2>Code of conduct</h2>
      <p>
        By participating you agree to abide by our{' '}
        <a href="https://github.com/K0802s/codemore-vscode/blob/main/CODE_OF_CONDUCT.md">
          Code of Conduct
        </a>.
      </p>
    </>
  );
}
