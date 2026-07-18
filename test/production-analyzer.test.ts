/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Test file — pragmatic shimming + console output during test runs are
   intentional. The test-path heuristic already downgrades severity to
   MINOR/INFO; this directive removes the noise from CI summaries. */

import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { analyzeProjectWithProductionCore } from "../web/src/lib/productionAnalyzer";
import { ProjectFile } from "../web/src/lib/types";
import { scanProject } from "../daemon/cli/projectScanner";

describe("production analyzer", () => {
  it("uses the daemon SQL analyzer for foreign key cascade statements", async () => {
    const files: ProjectFile[] = [
      {
        path: "schema.sql",
        language: "sql",
        size: 120,
        content: `
          CREATE TABLE child (
            parent_id UUID REFERENCES parent(id) ON DELETE CASCADE
          );
        `,
      },
    ];

    const result = await analyzeProjectWithProductionCore(files);
    const whereClauseIssue = result.issues.find((issue) =>
      issue.title.toLowerCase().includes("where clause")
    );

    assert.equal(whereClauseIssue, undefined);
  });

  it("uses the daemon JS analyzer for shell unzip commands", async () => {
    const files: ProjectFile[] = [
      {
        path: "scripts/download-binaries.js",
        language: "javascript",
        size: 96,
        content: 'await execAsync(`unzip -o "${archivePath}" -d "${destDir}"`);',
      },
    ];

    const result = await analyzeProjectWithProductionCore(files);
    const sqlIssue = result.issues.find((issue) =>
      issue.title.toLowerCase().includes("sql injection")
    );

    assert.equal(sqlIssue, undefined);
  });

  it("reports the same findings as a CLI-default scanProject for the same files (surface parity)", async () => {
    // Fires core-quality-unreachable-code (beta, default-on) deterministically.
    const content = [
      "export function a(): string {",
      '  return "a";',
      "  cleanup();",
      "}",
      "",
      "function cleanup(): void {}",
      "",
    ].join("\n");
    const files: ProjectFile[] = [
      { path: "src/app.ts", language: "typescript", size: content.length, content },
    ];

    const web = await analyzeProjectWithProductionCore(files);

    // Same file on disk, scanned exactly the way `codemore scan .` does
    // (enableExperimental unset → false).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codemore-parity-"));
    try {
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(path.join(root, "src", "app.ts"), content, "utf8");
      const report = await scanProject({ root });

      const cliKeys = report.issues
        .map((i) => `${i.evidence.file}:${i.evidence.line}:${i.severity}:${i.title}`)
        .sort();
      const webKeys = web.issues
        .map((i) => `${i.location.filePath}:${i.location.range.start.line}:${i.severity}:${i.title}`)
        .sort();

      assert.ok(cliKeys.length > 0, "fixture must produce at least one CLI finding");
      assert.deepEqual(webKeys, cliKeys, "web scan must match CLI defaults for the same input");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
