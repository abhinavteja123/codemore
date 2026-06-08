/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Test file — pragmatic shimming + console output during test runs are
   intentional. The test-path heuristic already downgrades severity to
   MINOR/INFO; this directive removes the noise from CI summaries. */

import { strict as assert } from "assert";
import { parseAiFixResponseText } from "../daemon/services/aiService";
import { CodeSuggestion } from "../shared/protocol";

function createSuggestion(id: string): CodeSuggestion {
  return {
    id,
    issueId: "issue-1",
    title: "Fix title",
    description: "Fix description",
    originalCode: "const a = 1;",
    suggestedCode: "const a = 2;",
    diff: "-const a = 1;\n+const a = 2;",
    location: {
      filePath: "src/index.ts",
      range: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 12 },
      },
    },
    confidence: 90,
    impact: 80,
    tags: ["bug", "ai-generated"],
  };
}

describe("AI fix parser", () => {
  it("parses a fenced JSON array response", () => {
    const suggestions = [createSuggestion("fix-1")];
    const parsed = parseAiFixResponseText(
      `\`\`\`json\n${JSON.stringify(suggestions, null, 2)}\n\`\`\``
    );

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, "fix-1");
  });

  it("parses a JSON object with a top-level suggestions array", () => {
    const payload = {
      suggestions: [createSuggestion("fix-2")],
    };

    const parsed = parseAiFixResponseText(JSON.stringify(payload));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, "fix-2");
  });

  it("extracts JSON from surrounding prose", () => {
    const payload = {
      suggestions: [createSuggestion("fix-3")],
    };

    const parsed = parseAiFixResponseText(
      `Here is the fix payload.\n${JSON.stringify(payload, null, 2)}\nUse it as-is.`
    );

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, "fix-3");
  });
});
