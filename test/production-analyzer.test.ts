/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Test file — pragmatic shimming + console output during test runs are
   intentional. The test-path heuristic already downgrades severity to
   MINOR/INFO; this directive removes the noise from CI summaries. */

import { strict as assert } from "assert";
import { analyzeProjectWithProductionCore } from "../web/src/lib/productionAnalyzer";
import { ProjectFile } from "../web/src/lib/types";

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
});
