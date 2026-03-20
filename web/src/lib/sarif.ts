import { CodeIssue, Severity } from "./types";

// SARIF v2.1.0 export
// See: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

const severityToLevel: Record<Severity, string> = {
  BLOCKER: "error",
  CRITICAL: "error",
  MAJOR: "warning",
  MINOR: "note",
  INFO: "note",
};

export function generateSarif(
  projectName: string,
  issues: CodeIssue[]
): object {
  const rules = new Map<string, { id: string; name: string; shortDescription: string; defaultLevel: string }>();

  for (const issue of issues) {
    const ruleId = issue.id.replace(/-\d+$/, ""); // strip line number suffix
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        name: issue.title,
        shortDescription: issue.description,
        defaultLevel: severityToLevel[issue.severity],
      });
    }
  }

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "CodeMore",
            version: "1.0.0",
            informationUri: "https://github.com/codemore/codemore",
            rules: Array.from(rules.values()).map((r) => ({
              id: r.id,
              name: r.name,
              shortDescription: { text: r.shortDescription },
              defaultConfiguration: { level: r.defaultLevel },
            })),
          },
        },
        results: issues.map((issue) => ({
          ruleId: issue.id.replace(/-\d+$/, ""),
          level: severityToLevel[issue.severity],
          message: { text: issue.description },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: issue.location.filePath },
                region: {
                  startLine: issue.location.range.start.line + 1,
                  startColumn: issue.location.range.start.column + 1,
                  endLine: issue.location.range.end.line + 1,
                  endColumn: issue.location.range.end.column + 1,
                },
              },
            },
          ],
          properties: {
            category: issue.category,
            confidence: issue.confidence,
            impact: issue.impact,
          },
        })),
      },
    ],
  };
}
