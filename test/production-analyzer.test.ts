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
