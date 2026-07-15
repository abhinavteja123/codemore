/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Test file — pragmatic shimming + console output during test runs are
   intentional. The test-path heuristic already downgrades severity to
   MINOR/INFO; this directive removes the noise from CI summaries. */

// NOTE (0.3.0): the StaticAnalyzer + configLoader-override regression tests
// that used to live here were deleted together with the legacy pipeline
// (daemon/services/staticAnalyzer.ts). Every scan surface now routes
// through the rule registry, whose regressions are covered by the corpus
// fixtures (corpus/rules/**) + test/parity.test.ts. Only the web regex
// fallback (web/src/lib/analyzer.ts — non-registry languages) keeps a
// regression check here.

import { strict as assert } from "assert";
import { analyzeFile as analyzeWebFile } from "../web/src/lib/analyzer";

describe("analyzer regressions", () => {
  it("web analyzer does not flag execAsync shell commands as SQL injection", () => {
    const issues = analyzeWebFile({
      path: "scripts/download-binaries.js",
      content: 'await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);',
      language: "js",
      size: 64,
    });

    assert.equal(
      issues.some((issue) => issue.title === "Potential SQL injection"),
      false
    );
  });
});
