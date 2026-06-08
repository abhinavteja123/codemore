/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Test file — pragmatic shimming + console output during test runs are
   intentional. The test-path heuristic already downgrades severity to
   MINOR/INFO; this directive removes the noise from CI summaries. */

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
