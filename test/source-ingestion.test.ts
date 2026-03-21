import { strict as assert } from "assert";
import { filterProjectFiles } from "../web/src/lib/sourceIngestion";
import { ProjectFile } from "../web/src/lib/types";

describe("source ingestion", () => {
  it("filters excluded, duplicate, and oversized files", () => {
    const files: ProjectFile[] = [
      {
        path: "node_modules/pkg/index.js",
        language: "js",
        size: 20,
        content: "console.log('skip');",
      },
      {
        path: "src/app.ts",
        language: "ts",
        size: 24,
        content: "export const value = 1;",
      },
      {
        path: "src/app.ts",
        language: "ts",
        size: 24,
        content: "export const value = 2;",
      },
      {
        path: "src/huge.ts",
        language: "ts",
        size: 600 * 1024,
        content: "x".repeat(600 * 1024),
      },
    ];

    const filtered = filterProjectFiles(files);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].path, "src/app.ts");
  });
});
