/**
 * CodeMoreReport → SARIF 2.1.0 converter.
 *
 * SARIF is the interchange format GitHub code scanning, VS Code SARIF
 * viewers, and most security dashboards consume. `codemore scan --format
 * sarif` + `github/codeql-action/upload-sarif` puts findings in a repo's
 * Security tab with zero PR-comment plumbing.
 *
 * Lives in shared/report (not the CLI) so every surface emits the same
 * SARIF the same way — same one-brain rule as the JSON report itself.
 *
 * Mapping notes:
 *   - severity → SARIF level: BLOCKER/CRITICAL → error, MAJOR → warning,
 *     MINOR/INFO → note. The original severity is preserved in
 *     properties.codemoreSeverity.
 *   - result.partialFingerprints carries the instanceId so repeated uploads
 *     dedupe on GitHub's side.
 *   - artifactLocation.uri is the report's file path with forward slashes,
 *     relative to the scanned root — GitHub resolves it against the repo root.
 */

import type { CodeMoreReport, ReportIssue, Severity } from './types';

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'BLOCKER':
    case 'CRITICAL':
      return 'error';
    case 'MAJOR':
      return 'warning';
    default:
      return 'note';
  }
}

function toUri(file: string): string {
  return file.replace(/\\/g, '/');
}

export function toSarif(report: CodeMoreReport): object {
  // One reportingDescriptor per distinct rule, in first-seen order.
  const ruleIndex = new Map<string, number>();
  const rules: object[] = [];
  for (const iss of report.issues) {
    if (ruleIndex.has(iss.id)) continue;
    ruleIndex.set(iss.id, rules.length);
    rules.push({
      id: iss.id,
      name: iss.id,
      shortDescription: { text: iss.title },
      fullDescription: { text: iss.whyItMatters },
      helpUri: iss.citation,
      defaultConfiguration: { level: sarifLevel(iss.severity) },
    });
  }

  const results = report.issues.map((iss: ReportIssue) => ({
    ruleId: iss.id,
    ruleIndex: ruleIndex.get(iss.id),
    level: sarifLevel(iss.severity),
    message: {
      text: `${iss.title} — ${iss.whyItMatters}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toUri(iss.evidence.file) },
          region: {
            startLine: iss.evidence.line,
            startColumn: Math.max(1, iss.evidence.column),
            ...(iss.evidence.endLine !== undefined ? { endLine: iss.evidence.endLine } : {}),
            ...(iss.evidence.endColumn !== undefined ? { endColumn: iss.evidence.endColumn } : {}),
          },
        },
      },
    ],
    partialFingerprints: { codemoreInstanceId: iss.instanceId },
    properties: {
      codemoreSeverity: iss.severity,
      confidence: iss.confidence,
      category: iss.category,
      ...(iss.suggestedFix ? { suggestedFix: iss.suggestedFix.instructions } : {}),
    },
  }));

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeMore',
            informationUri: 'https://codemore.tech',
            version: report.tool.version,
            rules,
          },
        },
        results,
      },
    ],
  };
}
