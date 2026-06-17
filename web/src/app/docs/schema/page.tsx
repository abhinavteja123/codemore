import fs from "fs";
import path from "path";

import CodeBlock from "@/components/docs/CodeBlock";
import Callout from "@/components/docs/Callout";
import NextStep from "@/components/docs/NextStep";

export const metadata = {
  title: "Report schema — CodeMore",
  description:
    "codemore-report.json v1.0.0 — the JSON shape every CodeMore surface emits. Same shape, same fingerprint, byte-identical across CLI, MCP, VS Code, GitHub Action.",
};

function loadSchema(): string {
  const p = path.resolve(process.cwd(), "..", "shared", "report", "schema.json");
  try { return fs.readFileSync(p, "utf8"); }
  catch { return "{}"; }
}

export default function SchemaPage() {
  const schema = loadSchema();
  let parsed: { properties?: Record<string, { description?: string; type?: string; const?: string }> } = {};
  try { parsed = JSON.parse(schema); } catch { /* ignore */ }
  const fields = parsed.properties ?? {};

  return (
    <>
      <h1>Report schema</h1>
      <p className="lead">
        Every scan emits a <code>codemore-report.json</code> document conforming
        to schema version{" "}
        <code>{parsed.properties?.schemaVersion?.const ?? "1.0.0"}</code>. The
        shape is identical across the CLI, the MCP server, and the VS Code
        extension — the &ldquo;one brain, many skins&rdquo; property locked by{" "}
        <code>test/parity.test.ts</code>.
      </p>

      <Callout type="note" title="schema is the API">
        Agents consume JSON; they don&apos;t care which surface produced it.{" "}
        <code>schemaVersion</code> is semver — breaking changes bump major and
        ship with a migration guide.
      </Callout>

      <h2 id="top-level">Top-level fields</h2>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          {Object.entries(fields).slice(0, 30).map(([k, v]) => (
            <tr key={k}>
              <td><code>{k}</code></td>
              <td><code>{v.type ?? "object"}</code></td>
              <td>{v.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="agent-instructions">Why <code>agentInstructions</code></h2>
      <p>
        Every report embeds a small <code>agentInstructions</code> block telling
        the consuming LLM <em>how</em> to apply the findings — ordering hints,
        directories to skip, when to stop on a validator failure. Without it,
        agents have to invent their own remediation policy on every run.
      </p>

      <h2 id="full-schema">Full schema</h2>
      <CodeBlock lang="json">{schema}</CodeBlock>

      <h2 id="why">Why a versioned report</h2>
      <ul>
        <li>
          <strong>Forward compatibility.</strong> <code>schemaVersion</code> is
          semver; breaking changes bump major and ship a migration guide.
        </li>
        <li>
          <strong>Per-rule semver.</strong> Each finding carries{" "}
          <code>ruleVersion</code>. A single bad rule reverts without a tool
          release.
        </li>
        <li>
          <strong>Deduplication.</strong> The <code>fingerprint</code> +{" "}
          <code>instanceId</code> pair lets CI systems compare runs and surface
          only NEW findings since baseline.
        </li>
      </ul>

      <NextStep
        href="/docs/rules"
        title="Browse the rules that produce these findings"
        description="Every rule emits the same finding shape — grouped by pack, with TP/FP fixtures."
      />
    </>
  );
}
