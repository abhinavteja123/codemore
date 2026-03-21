import { strict as assert } from "assert";
import {
  getCachedSuggestionsForProjectIssue,
  resolveSuggestionsForProjectIssue,
  SuggestionServiceError,
} from "../web/src/lib/suggestionService";
import { CodeSuggestion } from "../web/src/lib/types";

describe("suggestion service", () => {
  const project = {
    id: "project-1",
    name: "Project",
    source: "upload" as const,
    files: [],
    issues: [
      {
        id: "issue-1",
        title: "Issue",
        description: "Desc",
        category: "bug" as const,
        severity: "MAJOR" as const,
        location: {
          filePath: "src/app.ts",
          range: {
            start: { line: 0, column: 0 },
            end: { line: 0, column: 5 },
          },
        },
        codeSnippet: "const a = 1",
        confidence: 80,
        impact: 70,
        createdAt: Date.now(),
      },
    ],
  };

  it("returns cached suggestions for an issue", async () => {
    const cached: CodeSuggestion[] = [
      {
        id: "suggestion-1",
        issueId: "issue-1",
        title: "Cached fix",
        description: "Use the cached fix",
        originalCode: "a",
        suggestedCode: "b",
        diff: "-a\n+b",
        location: project.issues[0].location,
        confidence: 90,
        impact: 80,
        tags: ["cached"],
      },
    ];

    const suggestions = await getCachedSuggestionsForProjectIssue(
      "project-1",
      "user@example.com",
      "issue-1",
      {
        getProjectSnapshot: async () => project,
        getSuggestionsForIssue: async () => cached,
        saveSuggestionsForIssue: async () => true,
        generateFixSuggestionsForIssue: async () => [],
      }
    );

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].title, "Cached fix");
  });

  it("generates and persists suggestions on POST cache miss", async () => {
    const generated: CodeSuggestion[] = [
      {
        id: "suggestion-2",
        issueId: "issue-1",
        title: "Generated fix",
        description: "Use generated fix",
        originalCode: "a",
        suggestedCode: "b",
        diff: "-a\n+b",
        location: project.issues[0].location,
        confidence: 88,
        impact: 77,
        tags: ["generated"],
      },
    ];

    const savedCalls: Array<{
      projectId: string;
      issueId: string;
      suggestions: CodeSuggestion[];
    }> = [];

    const result = await resolveSuggestionsForProjectIssue(
      "project-1",
      "user@example.com",
      "issue-1",
      true,
      {
        getProjectSnapshot: async () => project,
        getSuggestionsForIssue: async () => [],
        saveSuggestionsForIssue: async (
          projectId: string,
          issueId: string,
          suggestions: CodeSuggestion[]
        ) => {
          savedCalls.push({ projectId, issueId, suggestions });
          return true;
        },
        generateFixSuggestionsForIssue: async () => generated,
      }
    );

    assert.equal(result.cached, false);
    assert.equal(result.suggestions.length, 1);
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].projectId, "project-1");
    assert.equal(savedCalls[0].issueId, "issue-1");
    assert.equal(savedCalls[0].suggestions.length, 1);
  });

  it("returns cached suggestions on POST without regenerating", async () => {
    const cached: CodeSuggestion[] = [
      {
        id: "suggestion-3",
        issueId: "issue-1",
        title: "Cached POST fix",
        description: "Already stored",
        originalCode: "a",
        suggestedCode: "b",
        diff: "-a\n+b",
        location: project.issues[0].location,
        confidence: 85,
        impact: 75,
        tags: ["cached"],
      },
    ];

    let generatedCalled = false;

    const result = await resolveSuggestionsForProjectIssue(
      "project-1",
      "user@example.com",
      "issue-1",
      true,
      {
        getProjectSnapshot: async () => project,
        getSuggestionsForIssue: async () => cached,
        saveSuggestionsForIssue: async () => true,
        generateFixSuggestionsForIssue: async () => {
          generatedCalled = true;
          return [];
        },
      }
    );

    assert.equal(result.cached, true);
    assert.equal(result.suggestions.length, 1);
    assert.equal(generatedCalled, false);
  });

  it("throws a typed error when the issue id is missing", async () => {
    await assert.rejects(
      () =>
        resolveSuggestionsForProjectIssue("project-1", "user@example.com", "", true, {
          getProjectSnapshot: async () => project,
          getSuggestionsForIssue: async () => [],
          saveSuggestionsForIssue: async () => true,
          generateFixSuggestionsForIssue: async () => [],
        }),
      (error: unknown) =>
        error instanceof SuggestionServiceError &&
        error.status === 400 &&
        error.message === "issueId is required"
    );
  });
});
