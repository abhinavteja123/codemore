import fs from 'fs';
import path from 'path';

export const metadata = { title: 'Report schema — CodeMore' };

function loadSchema(): string {
  const p = path.resolve(process.cwd(), '..', 'shared', 'report', 'schema.json');
  try { return fs.readFileSync(p, 'utf8'); }
  catch { return '{}'; }
}

export default function SchemaPage() {
  const schema = loadSchema();
  const sample = JSON.parse(schema);
  const fields = (sample.properties ?? {}) as Record<string, { description?: string; type?: string }>;
  return (
    <>
      <h1>Report schema</h1>
      <p>
        Every scan emits a <code>codemore-report.json</code> document conforming to schema
        version <code>{sample.properties?.schemaVersion?.const ?? '1.0.0'}</code>. The shape is
        identical across the CLI, the MCP server, and the VS Code extension — that&apos;s the
        &ldquo;one brain, many skins&rdquo; property locked by <code>test/parity.test.ts</code>.
      </p>

      <h2>Top-level fields</h2>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          {Object.entries(fields).slice(0, 30).map(([k, v]) => (
            <tr key={k}>
              <td><code>{k}</code></td>
              <td><code>{v.type ?? 'object'}</code></td>
              <td>{v.description ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Full schema</h2>
      <pre className="overflow-x-auto"><code className="text-xs">{schema}</code></pre>

      <h2>Why a schema</h2>
      <ul>
        <li>
          <strong>The schema IS the API.</strong> Agents consume JSON; they don&apos;t care which
          surface produced it.
        </li>
        <li>
          <strong>Forward compatibility.</strong> <code>schemaVersion</code> is semver; breaking
          changes bump major and ship with a migration guide.
        </li>
        <li>
          <strong>Per-rule semver.</strong> Each finding carries <code>ruleVersion</code>. A
          single bad rule can be reverted without a tool release.
        </li>
      </ul>
    </>
  );
}
